"""Redis journal of board edits whose final save to Postgres failed.

When the last client leaves and the save fails (a database outage), the
replica's doc is stashed here so a worker restart cannot lose it. Each entry
records the version and CRDT state vector it was based on: an entry is only
merged back into a stored doc that descends from that base, so a REST save
that replaced the board in the meantime is never overwritten.
"""

import base64
import json
import uuid
from dataclasses import dataclass

from pycrdt import Doc

from app.realtime.redis_client import get_redis as _client

_PREFIX = "board-unsaved"


@dataclass(frozen=True)
class UnsavedEdit:
    key: str
    base_version: int
    base_state: bytes
    update: bytes


def key_for(board_id: uuid.UUID, replica_id: str) -> str:
    return f"{_PREFIX}:{board_id}:{replica_id}"


def _encode(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


async def stash(key: str, *, base_version: int, base_state: bytes, update: bytes) -> None:
    await _client().set(key, json.dumps({
        "base_version": base_version,
        "base_state": _encode(base_state),
        "update": _encode(update),
    }))


async def entries(board_id: uuid.UUID) -> list[UnsavedEdit]:
    client = _client()
    keys = [key async for key in client.scan_iter(match=f"{_PREFIX}:{board_id}:*", count=100)]
    if not keys:
        return []
    found = []
    for key, raw in zip(keys, await client.mget(keys)):
        if raw is None:
            continue
        value = json.loads(raw)
        found.append(UnsavedEdit(
            key=key,
            base_version=value["base_version"],
            base_state=base64.b64decode(value["base_state"]),
            update=base64.b64decode(value["update"]),
        ))
    return found


async def boards() -> set[uuid.UUID]:
    found = set()
    async for key in _client().scan_iter(match=f"{_PREFIX}:*", count=100):
        found.add(uuid.UUID(key.split(":")[1]))
    return found


async def discard(*keys: str) -> None:
    if keys:
        await _client().delete(*keys)


def _read_varuint(data: bytes, offset: int) -> tuple[int, int]:
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, offset
        shift += 7


def decode_state_vector(state: bytes) -> dict[int, int]:
    """Yjs v1 state vector: count, then (client id, clock) pairs as varuints."""
    count, offset = _read_varuint(state, 0)
    clocks = {}
    for _ in range(count):
        client, offset = _read_varuint(state, offset)
        clocks[client], offset = _read_varuint(state, offset)
    return clocks


def descends(stored_update: bytes | None, base_state: bytes) -> bool:
    """Whether a stored doc contains everything in the base state vector.

    CRDT saves only ever grow a stored doc, so it descends from every doc it
    was saved over, and docs seeded from the same snapshot share their seed.
    A REST save clears the doc (None) and the next session seeds it under a
    new version's client id, which breaks the chain.
    """
    if not stored_update:
        return False
    doc = Doc()
    doc.apply_update(stored_update)
    stored = decode_state_vector(doc.get_state())
    return all(stored.get(client, 0) >= clock for client, clock in decode_state_vector(base_state).items())


def mergeable(edit: UnsavedEdit, *, version: int, ydoc_state: bytes | None) -> bool:
    """An edit may be merged into the board as stored now without overwriting it."""
    return version == edit.base_version or descends(ydoc_state, edit.base_state)
