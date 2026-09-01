from enum import StrEnum
from typing import Any, Self

from pydantic import BaseModel, Field, model_validator

MAX_NODES = 500
MAX_EDGES = 2000
MAX_LABEL = 500


class NodeKind(StrEnum):
    """Mirrors frontend/src/canvas/catalog.ts. The analyzer depends on it."""

    CLIENT = "client"
    CDN = "cdn"
    LOAD_BALANCER = "load_balancer"
    API_SERVICE = "api_service"
    SERVICE = "service"
    DATABASE = "database"
    REDIS = "redis"
    CACHE = "cache"
    QUEUE = "queue"
    WORKER = "worker"
    OBJECT_STORAGE = "object_storage"
    SEARCH = "search"
    EXTERNAL_API = "external_api"

    STICKY_NOTE = "sticky_note"
    TEXT = "text"
    SHAPE = "shape"


ANNOTATION_KINDS = frozenset(
    {NodeKind.STICKY_NOTE, NodeKind.TEXT, NodeKind.SHAPE}
)


class Position(BaseModel):
    x: float
    y: float


class NodeData(BaseModel):
    kind: NodeKind
    label: str = Field(default="", max_length=MAX_LABEL)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PersistedNode(BaseModel):
    """The canonical stored shape.

    Pydantic drops unknown keys, which is how React Flow's per-viewer UI state
    (selected, dragging, measured, ...) is kept out of shared board state.
    """

    id: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=50)
    position: Position
    data: NodeData
    width: float | None = None
    height: float | None = None


class PersistedEdge(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=100)
    target: str = Field(min_length=1, max_length=100)
    sourceHandle: str | None = None
    targetHandle: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class BoardSnapshot(BaseModel):
    nodes: list[PersistedNode] = Field(default_factory=list, max_length=MAX_NODES)
    edges: list[PersistedEdge] = Field(default_factory=list, max_length=MAX_EDGES)

    @model_validator(mode="after")
    def check_graph_integrity(self) -> Self:
        node_ids = {node.id for node in self.nodes}
        if len(node_ids) != len(self.nodes):
            raise ValueError("duplicate node id")

        edge_ids = {edge.id for edge in self.edges}
        if len(edge_ids) != len(self.edges):
            raise ValueError("duplicate edge id")

        # JSONB cannot express a foreign key, so referential integrity is
        # enforced here instead: no edge may dangle.
        for edge in self.edges:
            if edge.source not in node_ids or edge.target not in node_ids:
                raise ValueError(f"edge {edge.id} references a missing node")

        return self
