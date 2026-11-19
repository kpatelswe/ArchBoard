"""In-memory CRDT board state during a live session.

The board is a Yjs document (via pycrdt): two root maps, ``nodes`` and
``edges``, keyed by id, each value a map of that element's fields. Clients
hold replicas of the same document; edits travel as binary CRDT updates that
merge commutatively, so the server no longer arbitrates conflicts — it
validates *who* may write and persists the merged result.

Persistence stores two forms side by side: the encoded doc (merge history,
what live sessions load) and the materialized JSON snapshot (what REST reads
and the analyzer consume). The version-CAS survives, but a lost race is now
resolved by *merging* the other writer's doc instead of overwriting it —
the one concurrency problem CRDTs genuinely erase.
"""

import asyncio
import contextlib
import logging
import uuid
from collections.abc import Callable

from pycrdt import Doc, Map
from pydantic import ValidationError

from app.core.db import SessionLocal
from app.repositories import board_repository
from app.schemas.snapshot import BoardSnapshot

FLUSH_SECONDS = 1.0
MAX_RETRY_SECONDS = 60.0
logger = logging.getLogger(__name__)


class BoardState:
    def __init__(self, board_id: uuid.UUID, doc: Doc, version: int) -> None:
        self.board_id = board_id
        self.doc = doc
        self.version = version
        self._dirty = False
        self._superseded = False
        self._flush_task: asyncio.Task | None = None

    @classmethod
    async def load(cls, board_id: uuid.UUID) -> "BoardState":
        async with SessionLocal() as session:
            board = await board_repository.get(session, board_id)
        if board is None:
            raise LookupError("board vanished")

        doc = Doc()
        nodes = doc.get("nodes", type=Map)
        edges = doc.get("edges", type=Map)
        if board.ydoc_state:
            doc.apply_update(board.ydoc_state)
        else:
            # No CRDT history yet (fresh board, or a REST save cleared it):
            # seed the doc from the JSON snapshot.
            snapshot = BoardSnapshot.model_validate(board.current_snapshot)
            for node in snapshot.nodes:
                nodes[node.id] = Map(node.model_dump(mode="json", exclude_none=True))
            for edge in snapshot.edges:
                edges[edge.id] = Map(edge.model_dump(mode="json", exclude_none=True))
        return cls(board_id, doc, board.version)

    def encoded_state(self) -> bytes:
        """The full document as one update — what joiners and flushes use."""
        return self.doc.get_update()

    def apply_update(self, update: bytes, *, mark_dirty: bool = True) -> None:
        """Merge one binary CRDT update into the document.

        Remote applies (updates another process already owns) pass
        mark_dirty=False: every process converges its replica, but only the
        origin process persists. Raises on bytes that are not a Yjs update.
        """
        self.doc.apply_update(update)
        if mark_dirty:
            self._dirty = True

    def to_snapshot(self) -> dict:
        raw = {
            "nodes": list(self.doc.get("nodes", type=Map).to_py().values()),
            "edges": list(self.doc.get("edges", type=Map).to_py().values()),
        }
        for node in raw['nodes']:
            data = node.get('data', {})
            data = dict(data) if isinstance(data, dict) else {}
            if 'metadata' in data and not isinstance(data['metadata'], dict):
                data['metadata'] = {}
            if 'data:label' in node:
                data['label'] = node.pop('data:label')
            if 'data:technology' in node:
                metadata = dict(data.get('metadata', {}))
                technology = node.pop('data:technology')
                if technology:
                    metadata['technology'] = technology
                else:
                    metadata.pop('technology', None)
                data['metadata'] = metadata
            node['data'] = data
        try:
            return BoardSnapshot.model_validate(raw).model_dump(mode="json")
        except ValidationError:
            # The CRDT tradeoff made concrete: updates are opaque, so shape
            # enforcement happens after merge, not before. Store the raw
            # materialization rather than dropping user work.
            return raw

    # -- persistence ---------------------------------------------------------

    def schedule_flush(self) -> None:
        # One debounce for everything: a binary update does not say whether
        # it moved a node or created one, so the structural/position split
        # from the intent protocol is gone. Worst case loses ~1s on a crash.
        if self._flush_task is not None and not self._flush_task.done():
            return
        self._flush_task = asyncio.create_task(self._flush_after(FLUSH_SECONDS))

    async def _flush_after(self, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        await self.flush()

    async def flush(self, *, yield_to_rest: bool = False) -> None:
        if not self._dirty:
            return
        self._dirty = False
        try:
            await self._persist(yield_to_rest=yield_to_rest)
        except BaseException:
            self._dirty = True
            raise

    async def _persist(self, *, yield_to_rest: bool = False) -> None:
        async with SessionLocal() as session:
            saved = await board_repository.update_snapshot(
                session,
                board_id=self.board_id,
                snapshot=self.to_snapshot(),
                expected_version=self.version,
                ydoc_state=self.encoded_state(),
            )
            if saved is not None:
                self.version = saved.version
                return
            # Another writer bumped the version (a REST save, or another
            # process's flush). Merge their document into ours — CRDT merge
            # is exactly the operation that makes this race harmless — and
            # write the union over their version.
            board = await board_repository.get(session, self.board_id)
            if board is None:
                return
            if yield_to_rest and not board.ydoc_state:
                # A REST save replaced the board (and cleared its CRDT
                # history) after this doc was loaded. With nobody connected,
                # that newer explicit save wins; the next session re-seeds
                # from it instead of this stale replica overwriting it.
                self.version = board.version
                self._superseded = True
                return
            if board.ydoc_state:
                self.doc.apply_update(board.ydoc_state)
            saved = await board_repository.update_snapshot(
                session,
                board_id=self.board_id,
                snapshot=self.to_snapshot(),
                expected_version=board.version,
                ydoc_state=self.encoded_state(),
            )
            if saved is not None:
                self.version = saved.version
            else:
                self._dirty = True  # lost twice; the next update retries


class BoardStateRegistry:
    """One BoardState per board with live connections."""

    def __init__(self) -> None:
        self._states: dict[uuid.UUID, BoardState] = {}
        self._load_lock = asyncio.Lock()
        # Each retry belongs to one replica: a board evicted and reloaded gets
        # a fresh BoardState, and its retry must not be shadowed by the old one.
        self._retries: dict[uuid.UUID, tuple[BoardState, asyncio.Task]] = {}

    async def acquire(self, board_id: uuid.UUID) -> BoardState:
        # The lock closes the gap where two first-connections both see "not
        # loaded" and load twice, silently forking the board's state.
        async with self._load_lock:
            state = self._states.get(board_id)
            if state is None:
                state = await BoardState.load(board_id)
                self._states[board_id] = state
            return state

    def peek(self, board_id: uuid.UUID) -> BoardState | None:
        return self._states.get(board_id)

    async def release(self, board_id: uuid.UUID, remaining_connections: Callable[[], int]) -> None:
        if remaining_connections() > 0:
            return
        async with self._load_lock:
            if remaining_connections() > 0:
                return
            state = self._states.get(board_id)
            if state is None:
                return
            if state._flush_task is not None:
                state._flush_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await state._flush_task
            try:
                await state.flush()  # last one out turns off the lights, durably
            finally:
                self._settle(board_id, state, remaining_connections)

    def _settle(
        self, board_id: uuid.UUID, state: BoardState, remaining_connections: Callable[[], int]
    ) -> None:
        """Evict an idle, persisted replica, or keep retrying an unsaved one.

        Runs under the load lock with no await, so no connection can join
        between the checks and the eviction.
        """
        if self._states.get(board_id) is not state or remaining_connections() > 0:
            return  # a live connection owns it; its release settles it again
        if not state._dirty:
            self._states.pop(board_id, None)
            self._cancel_retry(board_id)
            return
        current = self._retries.get(board_id)
        if current is not None and current[0] is state and not current[1].done():
            return
        self._cancel_retry(board_id)
        task = asyncio.create_task(self._retry_persist(board_id, state, remaining_connections))
        task.add_done_callback(lambda done: self._forget_retry(board_id, done))
        self._retries[board_id] = (state, task)

    def _cancel_retry(self, board_id: uuid.UUID) -> None:
        # Callers hold the load lock, so the retry is asleep or waiting for
        # the lock, never mid-save.
        entry = self._retries.pop(board_id, None)
        if entry is not None:
            entry[1].cancel()

    def _forget_retry(self, board_id: uuid.UUID, task: asyncio.Task) -> None:
        entry = self._retries.get(board_id)
        if entry is not None and entry[1] is task:
            del self._retries[board_id]

    async def _retry_persist(
        self, board_id: uuid.UUID, state: BoardState, remaining_connections: Callable[[], int]
    ) -> None:
        """Keep saving an idle board whose final save failed, with backoff.

        Exits (without evicting) as soon as a connection rejoins: that
        session resumes ownership of the replica and its release reschedules
        a retry if needed. Every decision is taken under the load lock, so a
        retry can never race acquire into forking the board.
        """
        delay = FLUSH_SECONDS
        while True:
            await asyncio.sleep(delay)
            async with self._load_lock:
                if self._states.get(board_id) is not state or remaining_connections() > 0:
                    return
                try:
                    await state.flush(yield_to_rest=True)
                except Exception:
                    logger.exception("idle board save retry failed: %s", board_id)
                if state._superseded:
                    logger.warning("idle board superseded by a REST save: %s", board_id)
                    self._states.pop(board_id, None)
                    return
                if not state._dirty:
                    self._states.pop(board_id, None)
                    return
            delay = min(delay * 2, MAX_RETRY_SECONDS)

registry = BoardStateRegistry()
