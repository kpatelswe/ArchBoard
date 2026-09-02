"""The realtime event protocol.

Inbound frames are parsed into exactly one of these models or rejected; the
broadcast re-serializes the *model*, so raw client JSON is never forwarded
(PRD §21). Node/edge payloads reuse the snapshot schemas — the wire format and
the storage format are deliberately the same shape.
"""

import uuid
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter

from app.schemas.snapshot import MAX_LABEL, NodeData, PersistedEdge, PersistedNode, Position


class NodeCreated(BaseModel):
    type: Literal["node.created"]
    node: PersistedNode


class NodeUpdated(BaseModel):
    """Partial update: only the supplied fields change."""

    type: Literal["node.updated"]
    node_id: str = Field(min_length=1, max_length=100)
    position: Position | None = None
    data: NodeData | None = None
    width: float | None = None
    height: float | None = None


class NodeDeleted(BaseModel):
    type: Literal["node.deleted"]
    node_id: str = Field(min_length=1, max_length=100)


class EdgeCreated(BaseModel):
    type: Literal["edge.created"]
    edge: PersistedEdge


class EdgeUpdated(BaseModel):
    type: Literal["edge.updated"]
    edge_id: str = Field(min_length=1, max_length=100)
    data: dict = Field(default_factory=dict)


class EdgeDeleted(BaseModel):
    type: Literal["edge.deleted"]
    edge_id: str = Field(min_length=1, max_length=100)


class CursorMoved(BaseModel):
    type: Literal["cursor.moved"]
    x: float
    y: float
    label: str | None = Field(default=None, max_length=MAX_LABEL)


class PresencePing(BaseModel):
    """Client heartbeat; refreshes the presence TTL, never broadcast."""

    type: Literal["presence.ping"]


InboundEvent = Annotated[
    Union[
        NodeCreated,
        NodeUpdated,
        NodeDeleted,
        EdgeCreated,
        EdgeUpdated,
        EdgeDeleted,
        CursorMoved,
        PresencePing,
    ],
    Field(discriminator="type"),
]

# One reusable parser; validate_json goes straight from bytes to model.
inbound_adapter: TypeAdapter[InboundEvent] = TypeAdapter(InboundEvent)

MutationEvent = (
    NodeCreated | NodeUpdated | NodeDeleted | EdgeCreated | EdgeUpdated | EdgeDeleted
)

# Structural events change what exists; position/metadata events change where
# it is. The two get different durability treatment (PRD §22).
STRUCTURAL_TYPES = {"node.created", "node.deleted", "edge.created", "edge.deleted"}


def outbound(event: BaseModel, *, user_id: uuid.UUID) -> dict:
    """Envelope for broadcast: the event plus its authenticated sender."""
    return {"user_id": str(user_id), **event.model_dump(mode="json")}


def error_frame(detail: str) -> dict:
    return {"type": "error", "detail": detail}
