"""Deterministic traffic propagation over a BoardGraph.

Board traffic enters at the clients and flows along edges in topological
order — a node's output is computed only once all its inputs are known, like
a spreadsheet recalculating. Every kind ships a default capacity (and caches
a default hit rate) so the simulation works on a bare sketch; a node's
metadata can override either. Modeling choices, stated plainly:

- A load balancer SPLITS traffic evenly across its targets; every other kind
  FANS OUT — one incoming request calls all downstreams (that is what a
  request that hits both the cache and the DB does).
- A cache absorbs its hit rate and forwards only the misses.
- A queue decouples: its consumers drain at their own capacity, so it
  forwards min(incoming, total consumer capacity) and grows a backlog when
  producers outpace that.
"""

import math

from pydantic import BaseModel, Field

from app.analysis.graph import CACHE_KINDS, BoardGraph, GraphNode
from app.analysis.rules import Finding
from app.schemas.snapshot import NodeKind

# Rough single-instance ballparks; the point is relative arithmetic, not
# vendor benchmarks. Clients are traffic sources and have no capacity.
DEFAULT_CAPACITY_RPS: dict[NodeKind, float] = {
    NodeKind.CDN: 50_000,
    NodeKind.LOAD_BALANCER: 20_000,
    NodeKind.API_SERVICE: 2_000,
    NodeKind.SERVICE: 2_000,
    NodeKind.DATABASE: 1_000,
    NodeKind.REDIS: 30_000,
    NodeKind.CACHE: 30_000,
    NodeKind.QUEUE: 10_000,
    NodeKind.WORKER: 500,
    NodeKind.OBJECT_STORAGE: 5_000,
    NodeKind.SEARCH: 1_500,
    NodeKind.EXTERNAL_API: 1_000,
}

# The provider tag (metadata.technology) refines the kind ballpark: DynamoDB
# is not Postgres, and Stripe will rate-limit you long before 1k RPS. Keys
# are lowercase; values beat the kind default, and an explicit capacity_rps
# on the node beats both.
TECHNOLOGY_CAPACITY_RPS: dict[str, float] = {
    # databases
    "postgresql": 1_000, "mysql": 1_000, "sqlite": 300,
    "mongodb": 2_000, "cassandra": 5_000, "dynamodb": 10_000,
    # caches / redis
    "redis": 30_000, "valkey": 30_000, "elasticache": 30_000,
    "upstash": 10_000, "memcached": 50_000, "in-process": 100_000,
    # queues
    "rabbitmq": 10_000, "kafka": 50_000, "sqs": 20_000,
    "redis streams": 20_000, "pub/sub": 50_000,
    # load balancers / cdn
    "nginx": 20_000, "haproxy": 25_000, "aws alb": 50_000,
    "envoy": 20_000, "traefik": 15_000,
    "cloudfront": 100_000, "cloudflare": 100_000, "fastly": 100_000,
    "akamai": 100_000,
    # api frameworks
    "fastapi": 2_000, "express": 2_000, "spring boot": 3_000,
    "go": 8_000, "rails": 800, "django": 1_000, "node.js": 2_000,
    "grpc": 5_000,
    # workers
    "celery": 500, "sidekiq": 800, "bullmq": 800, "aws lambda": 5_000,
    # search
    "elasticsearch": 1_500, "opensearch": 1_500, "algolia": 5_000,
    "meilisearch": 1_000, "typesense": 1_500,
    # external APIs: third parties rate-limit hard
    "stripe": 100, "twilio": 100, "sendgrid": 500, "auth0": 500,
    "openai": 50,
}

DEFAULT_HIT_RATE = 0.8


class NodeLoad(BaseModel):
    node_id: str
    label: str
    incoming_rps: float
    capacity_rps: float | None
    utilization: float | None  # None for clients (sources have no capacity)


class SimulationResult(BaseModel):
    traffic_rps: float
    loads: list[NodeLoad] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    # How many times current traffic fits before something saturates; None
    # when nothing carries load (or the graph has a cycle).
    headroom: float | None = None
    bottleneck_id: str | None = None


def _capacity(node: GraphNode) -> float | None:
    override = node.metadata.get("capacity_rps")
    if isinstance(override, (int, float)) and not isinstance(override, bool) and override > 0:
        return float(override)
    technology = node.metadata.get("technology")
    if isinstance(technology, str):
        by_tech = TECHNOLOGY_CAPACITY_RPS.get(technology.strip().lower())
        if by_tech is not None:
            return by_tech
    return DEFAULT_CAPACITY_RPS.get(node.kind)


def _hit_rate(node: GraphNode) -> float:
    override = node.metadata.get("hit_rate")
    if isinstance(override, (int, float)) and not isinstance(override, bool):
        return min(1.0, max(0.0, float(override)))
    return DEFAULT_HIT_RATE


def _topological_order(graph: BoardGraph) -> list[str] | None:
    """Kahn's algorithm; None means a cycle (simulation needs a DAG)."""
    indegree = {node_id: len(edges) for node_id, edges in graph.in_edges.items()}
    ready = [node_id for node_id, degree in indegree.items() if degree == 0]
    order: list[str] = []
    while ready:
        current = ready.pop()
        order.append(current)
        for edge in graph.out_edges[current]:
            indegree[edge.target] -= 1
            if indegree[edge.target] == 0:
                ready.append(edge.target)
    return order if len(order) == len(graph.nodes) else None


def simulate(graph: BoardGraph, traffic_rps: float) -> SimulationResult:
    result = SimulationResult(traffic_rps=traffic_rps)
    clients = [node for node in graph.nodes.values() if node.kind == NodeKind.CLIENT]
    if not clients or traffic_rps <= 0:
        return result

    order = _topological_order(graph)
    if order is None:
        result.findings.append(
            Finding(
                rule="simulation_skipped",
                severity="warning",
                message="Traffic simulation skipped: the graph contains a cycle",
                why="Propagation needs a definite direction of flow; a cycle "
                "has none.",
                mitigation="Break the cycle (the sync-cycle finding shows it).",
                when_its_fine="Never for simulation purposes.",
            )
        )
        return result

    incoming: dict[str, float] = {node_id: 0.0 for node_id in graph.nodes}
    share = traffic_rps / len(clients)
    for client in clients:
        incoming[client.id] = share

    for node_id in order:
        node = graph.nodes[node_id]
        load = incoming[node_id]
        out_edges = graph.out_edges[node_id]
        if not out_edges or load <= 0:
            continue
        if node.kind in CACHE_KINDS:
            forwarded = load * (1.0 - _hit_rate(node))
        elif node.kind == NodeKind.QUEUE:
            drain = sum(
                _capacity(graph.nodes[edge.target]) or math.inf
                for edge in out_edges
            )
            forwarded = min(load, drain)
        else:
            forwarded = load
        if node.kind == NodeKind.LOAD_BALANCER:
            per_edge = forwarded / len(out_edges)
            for edge in out_edges:
                incoming[edge.target] += per_edge
        else:
            for edge in out_edges:
                incoming[edge.target] += forwarded

    headroom: float | None = None
    bottleneck: str | None = None
    for node_id in order:
        node = graph.nodes[node_id]
        load = incoming[node_id]
        capacity = None if node.kind == NodeKind.CLIENT else _capacity(node)
        utilization = load / capacity if capacity else None
        result.loads.append(
            NodeLoad(
                node_id=node_id,
                label=node.label,
                incoming_rps=round(load, 1),
                capacity_rps=capacity,
                utilization=round(utilization, 3) if utilization is not None else None,
            )
        )
        if capacity and load > 0:
            ratio = capacity / load
            if headroom is None or ratio < headroom:
                headroom, bottleneck = ratio, node_id
        if utilization is not None and utilization > 1.0:
            result.findings.append(
                Finding(
                    rule="overload",
                    severity="error",
                    message=(
                        f"{node.label} receives {load:,.0f} RPS but handles "
                        f"{capacity:,.0f}"
                    ),
                    why="Sustained load beyond capacity means queuing, timeouts, "
                    "and eventually collapse — the overload also back-pressures "
                    "everything calling it.",
                    mitigation="Scale it out (more instances behind a balancer), "
                    "shed load with a cache in front, or shrink the fan-in.",
                    when_its_fine="A stated peak you'd consciously absorb with "
                    "degraded latency.",
                    node_ids=[node_id],
                )
            )
        if node.kind == NodeKind.QUEUE:
            drain = sum(
                _capacity(graph.nodes[edge.target]) or math.inf
                for edge in graph.out_edges[node_id]
            )
            if graph.out_edges[node_id] and load > drain:
                result.findings.append(
                    Finding(
                        rule="queue_backlog",
                        severity="error",
                        message=(
                            f"{node.label} fills faster than its workers drain "
                            f"({load:,.0f} in vs {drain:,.0f} out)"
                        ),
                        why="A queue hides overload instead of preventing it: "
                        "lag grows without bound and every job waits longer "
                        "than the one before.",
                        mitigation="Add workers (raise drain capacity) or slow "
                        "the producers.",
                        when_its_fine="Short bursts the queue is deliberately "
                        "sized to absorb — sustained imbalance is never fine.",
                        node_ids=[node_id],
                    )
                )

    if headroom is not None:
        result.headroom = round(headroom, 2)
        result.bottleneck_id = bottleneck
    return result
