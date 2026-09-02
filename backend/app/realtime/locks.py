"""Advisory editing locks: "Alice is editing this label."

Conflict AVOIDANCE, not resolution — the cheap social fix for last-write-wins
eating simultaneous text edits. A lock is a Redis key with a short TTL:

    editlock:{board}:{node} -> {"user_id", "name"}   EX 5

Advisory means nothing enforces it server-side beyond the honest client: a
rude client that edits anyway just gets the old LWW behavior. The TTL is the
cleanup — an editor whose tab crashes mid-edit releases in ≤5s, with no
tracking of who held what. Clients refresh while the edit box is open.
"""

import json
import uuid

from app.realtime.redis_client import get_redis

LOCK_TTL_SECONDS = 5


def _key(board_id: uuid.UUID, node_id: str) -> str:
    return f"editlock:{board_id}:{node_id}"


async def acquire(
    board_id: uuid.UUID, node_id: str, *, user_id: uuid.UUID, name: str | None
) -> dict | None:
    """Take or refresh the lock. Returns None on success, or the current
    holder's info if someone else has it.

    GET-then-SET is racy, but the lock is advisory: the worst outcome of a
    lost race is exactly the LWW behavior we already accept.
    """
    client = get_redis()
    key = _key(board_id, node_id)
    raw = await client.get(key)
    if raw is not None:
        holder = json.loads(raw)
        if holder["user_id"] != str(user_id):
            return holder
    await client.set(
        key,
        json.dumps({"user_id": str(user_id), "name": name}),
        ex=LOCK_TTL_SECONDS,
    )
    return None


async def release(board_id: uuid.UUID, node_id: str, *, user_id: uuid.UUID) -> bool:
    """Release only your own lock; returns True if released."""
    client = get_redis()
    key = _key(board_id, node_id)
    raw = await client.get(key)
    if raw is None or json.loads(raw)["user_id"] != str(user_id):
        return False
    await client.delete(key)
    return True
