"""Per-user event rate limiting, enforced in Redis.

Why Redis and not a process-local counter: the limit is per USER, and one
user can hold many sockets spread across many backend processes (tabs, or a
hostile client). Only a shared counter sees their aggregate rate; in-memory
counters would each happily allow the full budget.

Fixed-window algorithm: INCR a key scoped to (user, board, current window),
give it a TTL so windows clean themselves up. One round-trip per event.
Known weakness, accepted: a client can burst 2x the limit straddling a
window boundary. The sliding-window fix costs sorted sets per event and is
not worth it to stop humans-with-scripts.
"""

import time
import uuid

from app.realtime.redis_client import get_redis

WINDOW_SECONDS = 10
MAX_EVENTS_PER_WINDOW = 400  # two tabs dragging + cursors is ~250; floods are 1000s
ABUSE_MULTIPLIER = 5  # this far past the limit means a flood, not a human


async def register_event(user_id: uuid.UUID, board_id: uuid.UUID) -> int:
    """Count one inbound event; returns the running total for this window."""
    window = int(time.time()) // WINDOW_SECONDS
    key = f"rate:{board_id}:{user_id}:{window}"
    client = get_redis()
    count = await client.incr(key)
    if count == 1:
        # Expire a beat after the window ends so stragglers still match.
        await client.expire(key, WINDOW_SECONDS + 1)
    return count


def verdict(count: int) -> str:
    if count <= MAX_EVENTS_PER_WINDOW:
        return "allow"
    if count > MAX_EVENTS_PER_WINDOW * ABUSE_MULTIPLIER:
        return "disconnect"
    return "drop"
