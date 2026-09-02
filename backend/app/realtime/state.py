"""Authoritative in-memory board state during a live session.

While anyone is connected, the server applies every validated mutation here
and persists on its own schedule — clients stop writing snapshots themselves,
which removes the client-vs-client write race entirely: one writer per board.

Durability policy (PRD §22, decided in TODO): structural changes (create /
delete) flush almost immediately — losing a component someone added is a bug.
Position changes flush on a debounce — losing two seconds of drag is a shrug.
"""

import asyncio
import uuid

from app.core.db import SessionLocal
from app.realtime import events
from app.repositories import board_repository
from app.schemas.snapshot import BoardSnapshot, PersistedEdge, PersistedNode

STRUCTURAL_FLUSH_SECONDS = 0.2
POSITION_FLUSH_SECONDS = 2.0


class BoardState:
    def __init__(
        self,
        board_id: uuid.UUID,
        nodes: dict[str, PersistedNode],
        edges: dict[str, PersistedEdge],
        version: int,
    ) -> None:
        self.board_id = board_id
        self.nodes = nodes
        self.edges = edges
        self.version = version
        self._dirty = False
        self._flush_task: asyncio.Task | None = None
        self._flush_deadline = float("inf")

    @classmethod
    async def load(cls, board_id: uuid.UUID) -> "BoardState":
        async with SessionLocal() as session:
            board = await board_repository.get(session, board_id)
        if board is None:
            raise LookupError("board vanished")
        snapshot = BoardSnapshot.model_validate(board.current_snapshot)
        return cls(
            board_id,
            {node.id: node for node in snapshot.nodes},
            {edge.id: edge for edge in snapshot.edges},
            board.version,
        )

    def to_snapshot(self) -> dict:
        return BoardSnapshot(
            nodes=list(self.nodes.values()), edges=list(self.edges.values())
        ).model_dump(mode="json")

    # -- mutation application ------------------------------------------------

    def apply(self, event: events.MutationEvent) -> bool:
        """Apply one validated event. False means it does not fit the current
        graph (duplicate id, missing target) and must not be broadcast."""
        match event:
            case events.NodeCreated(node=node):
                if node.id in self.nodes:
                    return False
                self.nodes[node.id] = node
            case events.NodeUpdated():
                node = self.nodes.get(event.node_id)
                if node is None:
                    return False
                # model_copy does not re-validate, so patch with the already-
                # validated model instances, never with dumped dicts.
                patch = {
                    field: value
                    for field in ("position", "data", "width", "height")
                    if (value := getattr(event, field)) is not None
                }
                self.nodes[event.node_id] = node.model_copy(update=patch)
            case events.NodeDeleted(node_id=node_id):
                if self.nodes.pop(node_id, None) is None:
                    return False
                # A deleted node takes its edges with it, mirroring the
                # snapshot validator's no-dangling-edges rule.
                self.edges = {
                    edge_id: edge
                    for edge_id, edge in self.edges.items()
                    if node_id not in (edge.source, edge.target)
                }
            case events.EdgeCreated(edge=edge):
                if edge.id in self.edges:
                    return False
                if edge.source not in self.nodes or edge.target not in self.nodes:
                    return False
                self.edges[edge.id] = edge
            case events.EdgeUpdated():
                edge = self.edges.get(event.edge_id)
                if edge is None:
                    return False
                self.edges[event.edge_id] = edge.model_copy(
                    update={"data": event.data}
                )
            case events.EdgeDeleted(edge_id=edge_id):
                if self.edges.pop(edge_id, None) is None:
                    return False
            case _:
                return False
        self._dirty = True
        return True

    # -- persistence ---------------------------------------------------------

    def schedule_flush(self, *, structural: bool) -> None:
        delay = STRUCTURAL_FLUSH_SECONDS if structural else POSITION_FLUSH_SECONDS
        deadline = asyncio.get_running_loop().time() + delay
        # An earlier deadline replaces a later one; a later one never delays
        # an already-urgent flush.
        if self._flush_task is not None and not self._flush_task.done():
            if deadline >= self._flush_deadline:
                return
            self._flush_task.cancel()
        self._flush_deadline = deadline
        self._flush_task = asyncio.create_task(self._flush_after(delay))

    async def _flush_after(self, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        self._flush_deadline = float("inf")
        await self.flush()

    async def flush(self) -> None:
        if not self._dirty:
            return
        self._dirty = False
        snapshot = self.to_snapshot()
        async with SessionLocal() as session:
            saved = await board_repository.update_snapshot(
                session,
                board_id=self.board_id,
                snapshot=snapshot,
                expected_version=self.version,
            )
            if saved is not None:
                self.version = saved.version
                return
            # A REST save (stale tab) bumped the version underneath us. The
            # live session is authoritative while people are connected, so
            # adopt the new version number and write the live state over it.
            board = await board_repository.get(session, self.board_id)
            if board is None:
                return
            saved = await board_repository.update_snapshot(
                session,
                board_id=self.board_id,
                snapshot=snapshot,
                expected_version=board.version,
            )
            if saved is not None:
                self.version = saved.version
            else:
                self._dirty = True  # lost twice; the next event retries


class BoardStateRegistry:
    """One BoardState per board with live connections."""

    def __init__(self) -> None:
        self._states: dict[uuid.UUID, BoardState] = {}
        self._load_lock = asyncio.Lock()

    async def acquire(self, board_id: uuid.UUID) -> BoardState:
        # The lock closes the gap where two first-connections both see "not
        # loaded" and load twice, silently forking the board's state.
        async with self._load_lock:
            state = self._states.get(board_id)
            if state is None:
                state = await BoardState.load(board_id)
                self._states[board_id] = state
            return state

    async def release(self, board_id: uuid.UUID, remaining_connections: int) -> None:
        if remaining_connections > 0:
            return
        state = self._states.pop(board_id, None)
        if state is not None:
            if state._flush_task is not None:
                state._flush_task.cancel()
            await state.flush()  # last one out turns off the lights, durably


registry = BoardStateRegistry()
