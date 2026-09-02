"""Cross-process event fan-out over Redis pub/sub.

Every board event — even one whose sender and receivers share a process —
travels publish → Redis → subscriber. One uniform path means the two-process
case is not a special case; the cost is a sub-millisecond loopback hop.

Pub/sub is fire-and-forget on purpose: no retention, no acks, no replay. A
message to a board nobody is subscribed to vanishes, and that is correct —
disconnected clients recover from the Postgres snapshot, not from a log
(PRD §18, §23).
"""

import asyncio
import contextlib
import json
import uuid
from collections.abc import Awaitable, Callable

import redis.asyncio as aioredis

from app.core.config import get_settings

Handler = Callable[[uuid.UUID, dict], Awaitable[None]]


def _channel(board_id: uuid.UUID) -> str:
    return f"board:{board_id}"


class RedisBus:
    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None
        self._pubsub: aioredis.client.PubSub | None = None
        self._reader: asyncio.Task | None = None
        self._handlers: dict[uuid.UUID, Handler] = {}

    async def _ensure_started(self) -> None:
        if self._redis is not None:
            return
        self._redis = aioredis.from_url(
            get_settings().redis_url, decode_responses=True
        )
        self._pubsub = self._redis.pubsub()
        self._reader = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        assert self._pubsub is not None
        while True:
            try:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(0.5)  # redis hiccup; poll again
                continue
            if message is None:
                continue
            board_id = uuid.UUID(message["channel"].removeprefix("board:"))
            handler = self._handlers.get(board_id)
            if handler is not None:
                await handler(board_id, json.loads(message["data"]))

    async def subscribe(self, board_id: uuid.UUID, handler: Handler) -> None:
        """Called when a board gains its first local connection."""
        await self._ensure_started()
        assert self._pubsub is not None
        self._handlers[board_id] = handler
        await self._pubsub.subscribe(_channel(board_id))

    async def unsubscribe(self, board_id: uuid.UUID) -> None:
        if self._pubsub is None:
            return
        self._handlers.pop(board_id, None)
        await self._pubsub.unsubscribe(_channel(board_id))

    async def publish(self, board_id: uuid.UUID, message: dict) -> None:
        await self._ensure_started()
        assert self._redis is not None
        await self._redis.publish(_channel(board_id), json.dumps(message))

    async def close(self) -> None:
        if self._reader is not None:
            self._reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader
        if self._pubsub is not None:
            await self._pubsub.aclose()
        if self._redis is not None:
            await self._redis.aclose()


bus = RedisBus()
