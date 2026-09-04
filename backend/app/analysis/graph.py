"""Snapshot → analyzable graph.

Rules never see raw snapshots: the snapshot is a UI serialization (positions,
widths, annotation stickies) and its shape belongs to the frontend. Everything
architectural — who talks to whom, synchronously or not — is distilled here
once, so each rule reads a purpose-built structure instead of re-parsing
React Flow JSON. Annotation nodes and any edges touching them are dropped at
the door: a sticky note is documentation, not a dependency.
"""

from collections import deque
from dataclasses import dataclass

from app.schemas.snapshot import ANNOTATION_KINDS, BoardSnapshot, NodeKind

# Where requests come from and where durable data lives — several rules are
# questions about the paths between these two sets.
ENTRY_KINDS = {NodeKind.CLIENT}
PERSISTENT_KINDS = {NodeKind.DATABASE, NodeKind.OBJECT_STORAGE}


@dataclass(frozen=True)
class GraphNode:
    id: str
    kind: NodeKind
    label: str
    metadata: dict


@dataclass(frozen=True)
class GraphEdge:
    id: str
    source: str
    target: str
    synchronous: bool
    timeout_ms: float | None


class BoardGraph:
    def __init__(self, nodes: list[GraphNode], edges: list[GraphEdge]) -> None:
        self.nodes: dict[str, GraphNode] = {node.id: node for node in nodes}
        self.edges: list[GraphEdge] = edges
        self.out_edges: dict[str, list[GraphEdge]] = {node.id: [] for node in nodes}
        self.in_edges: dict[str, list[GraphEdge]] = {node.id: [] for node in nodes}
        for edge in edges:
            self.out_edges[edge.source].append(edge)
            self.in_edges[edge.target].append(edge)

    @classmethod
    def from_snapshot(cls, snapshot: BoardSnapshot) -> "BoardGraph":
        nodes = [
            GraphNode(
                id=node.id,
                kind=node.data.kind,
                label=node.data.label or node.data.kind.replace("_", " "),
                metadata=node.data.metadata,
            )
            for node in snapshot.nodes
            if node.data.kind not in ANNOTATION_KINDS
        ]
        kept = {node.id for node in nodes}
        edges = [
            GraphEdge(
                id=edge.id,
                source=edge.source,
                target=edge.target,
                synchronous=bool(edge.data.get("synchronous", True)),
                timeout_ms=_number_or_none(edge.data.get("timeout_ms")),
            )
            for edge in snapshot.edges
            if edge.source in kept and edge.target in kept
        ]
        return cls(nodes, edges)

    # -- queries rules build on ---------------------------------------------

    def of_kind(self, *kinds: NodeKind) -> list[GraphNode]:
        return [node for node in self.nodes.values() if node.kind in kinds]

    def reachable(self, starts: set[str], *, without: str | None = None) -> set[str]:
        """BFS over directed edges from `starts`. `without` pretends one node
        is dead — the primitive behind the SPOF rule."""
        seen = {s for s in starts if s != without}
        queue = deque(seen)
        while queue:
            current = queue.popleft()
            for edge in self.out_edges.get(current, ()):
                if edge.target == without or edge.target in seen:
                    continue
                seen.add(edge.target)
                queue.append(edge.target)
        return seen


def _number_or_none(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
