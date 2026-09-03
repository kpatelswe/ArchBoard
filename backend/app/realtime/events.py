"""The JSON side of the realtime protocol.

Board mutations travel as binary CRDT updates and never pass through here.
What remains is the ephemeral, human-facing traffic: cursors, presence
heartbeats, and editing awareness. Inbound frames are parsed into exactly one
of these models or rejected; the broadcast re-serializes the *model*, so raw
client JSON is never forwarded (PRD §21).
"""

import uuid
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter

from app.schemas.snapshot import MAX_LABEL


class CursorMoved(BaseModel):
    type: Literal["cursor.moved"]
    x: float
    y: float
    label: str | None = Field(default=None, max_length=MAX_LABEL)


class PresencePing(BaseModel):
    """Client heartbeat; refreshes the presence TTL, never broadcast."""

    type: Literal["presence.ping"]


class EditingStarted(BaseModel):
    """Awareness, not a lock: 'I am editing this node.' Nothing is enforced —
    the CRDT merges concurrent edits — this only paints the highlight on
    everyone else's screen. Refreshed while editing; remote peers expire it
    on their own clock, so a crashed editor's highlight fades by itself."""

    type: Literal["editing.started"]
    node_id: str = Field(min_length=1, max_length=100)


class EditingStopped(BaseModel):
    type: Literal["editing.stopped"]
    node_id: str = Field(min_length=1, max_length=100)


InboundEvent = Annotated[
    Union[CursorMoved, PresencePing, EditingStarted, EditingStopped],
    Field(discriminator="type"),
]

# One reusable parser; validate_json goes straight from bytes to model.
inbound_adapter: TypeAdapter[InboundEvent] = TypeAdapter(InboundEvent)


def outbound(event: BaseModel, *, user_id: uuid.UUID) -> dict:
    """Envelope for broadcast: the event plus its authenticated sender."""
    return {"user_id": str(user_id), **event.model_dump(mode="json")}


def error_frame(detail: str) -> dict:
    return {"type": "error", "detail": detail}
