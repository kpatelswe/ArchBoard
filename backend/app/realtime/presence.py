"""Who is on a board right now, tracked as Redis keys with a TTL.

The TTL is the failure detector: clients heartbeat every ~10s, each beat
resets the key to 20s, and any client that stops beating — crash, sleeping
laptop, dead TCP — simply expires. No sweeper, no cleanup code, no way for a
zombie to stay "online". This is also the cross-process answer to peer_count:
every process writes to the same keys, so the roster is global.
"""

import json
import uuid

from app.realtime.redis_client import get_redis as _client

PRESENCE_TTL_SECONDS = 20


def _key(board_id: uuid.UUID, user_id: uuid.UUID) -> str:
    return f"presence:{board_id}:{user_id}"


async def mark(
    board_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    name: str | None,
    avatar_url: str | None,
) -> None:
    """Create or refresh this user's presence; called on connect and on
    every heartbeat."""
    await _client().set(
        _key(board_id, user_id),
        json.dumps({"user_id": str(user_id), "name": name, "avatar_url": avatar_url}),
        ex=PRESENCE_TTL_SECONDS,
    )


async def clear(board_id: uuid.UUID, user_id: uuid.UUID) -> None:
    await _client().delete(_key(board_id, user_id))


async def roster(board_id: uuid.UUID) -> list[dict]:
    """Everyone currently present, across all backend processes."""
    client = _client()
    keys = [
        key
        async for key in client.scan_iter(match=f"presence:{board_id}:*", count=100)
    ]
    if not keys:
        return []
    values = await client.mget(keys)
    return [json.loads(value) for value in values if value is not None]
