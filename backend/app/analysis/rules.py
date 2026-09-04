"""The design linter: seven deterministic structural rules over a BoardGraph.

Every rule is a pure function `(graph) -> list[Finding]` — no
database, no network, no randomness, so the same board always lints the same
way and every rule is testable against a hand-built graph. Findings follow the
PRD's contextual format: what, why, how to fix, and when it's actually fine.
"""

from typing import Callable, Literal

from pydantic import BaseModel, Field

from app.analysis.graph import ENTRY_KINDS, PERSISTENT_KINDS, BoardGraph
from app.schemas.snapshot import NodeKind

MAX_SYNC_FANOUT = 3
MAX_SYNC_CHAIN = 4


class Finding(BaseModel):
    rule: str
    severity: Literal["error", "warning", "suggestion"]
    message: str
    why: str
    mitigation: str
    when_its_fine: str
    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)


Rule = Callable[[BoardGraph], list[Finding]]


def _labels(graph: BoardGraph, node_ids: list[str]) -> str:
    return ", ".join(graph.nodes[node_id].label for node_id in node_ids)


# -- 1. single point of failure ---------------------------------------------


def single_point_of_failure(graph: BoardGraph) -> list[Finding]:
    """A node whose death disconnects clients from durable data. Checked the
    honest way at whiteboard scale: pretend each node is dead (BFS skips it)
    and see whether any persistent store falls off the map."""
    entries = {node.id for node in graph.of_kind(*ENTRY_KINDS)}
    stores = {node.id for node in graph.of_kind(*PERSISTENT_KINDS)}
    if not entries or not stores:
        return []
    normally_reached = graph.reachable(entries) & stores
    if not normally_reached:
        return []  # no path at all; the layering/orphan rules speak to that

    findings = []
    for node_id in graph.nodes:
        if node_id in entries or node_id in stores:
            continue
        still_reached = graph.reachable(entries, without=node_id) & normally_reached
        if still_reached < normally_reached:
            lost = sorted(normally_reached - still_reached)
            findings.append(
                Finding(
                    rule="spof",
                    severity="error",
                    message=f"{graph.nodes[node_id].label} is a single point of failure",
                    why=(
                        f"If it dies, clients lose every path to "
                        f"{_labels(graph, lost)} — that data goes dark with one failure."
                    ),
                    mitigation=(
                        "Run more than one instance behind a load balancer, or add "
                        "an independent path to the data."
                    ),
                    when_its_fine=(
                        "Low-stakes internal tools where an outage costs minutes, "
                        "not money — redundancy has an ops price too."
                    ),
                    node_ids=[node_id],
                )
            )
    return findings


# -- 2. excessive sync fan-out ----------------------------------------------


def sync_fanout(graph: BoardGraph) -> list[Finding]:
    findings = []
    for node_id, edges in graph.out_edges.items():
        sync = [edge for edge in edges if edge.synchronous]
        if len(sync) > MAX_SYNC_FANOUT:
            downstream = [edge.target for edge in sync]
            findings.append(
                Finding(
                    rule="sync_fanout",
                    severity="warning",
                    message=(
                        f"{graph.nodes[node_id].label} waits on "
                        f"{len(sync)} synchronous calls"
                    ),
                    why=(
                        "One request blocks on all of them: the slowest sets the "
                        "latency, and availabilities multiply — four 99.9% "
                        "dependencies is ~99.6% for the caller."
                    ),
                    mitigation=(
                        "Make non-critical calls asynchronous (queue them), batch "
                        "them, or split the endpoint."
                    ),
                    when_its_fine=(
                        "All targets are fast, local, and genuinely required to "
                        "answer — an aggregator endpoint is sometimes just that."
                    ),
                    node_ids=[node_id, *downstream],
                    edge_ids=[edge.id for edge in sync],
                )
            )
    return findings


# -- 3. deep sync chain (and sync cycles) ------------------------------------


def deep_sync_chain(graph: BoardGraph) -> list[Finding]:
    """Longest path in the synchronous subgraph via DFS with memoization.
    A cycle in that subgraph is its own (worse) finding: request A waiting on
    B waiting on A is a deadlock built into the architecture."""
    sync_out = {
        node_id: [edge for edge in edges if edge.synchronous]
        for node_id, edges in graph.out_edges.items()
    }
    longest_from: dict[str, tuple[int, list[str]]] = {}
    in_progress: set[str] = set()
    cycle_members: set[str] = set()

    def longest(node_id: str) -> tuple[int, list[str]]:
        if node_id in longest_from:
            return longest_from[node_id]
        if node_id in in_progress:
            cycle_members.add(node_id)
            return (0, [node_id])
        in_progress.add(node_id)
        best = (0, [node_id])
        for edge in sync_out[node_id]:
            hops, path = longest(edge.target)
            if hops + 1 > best[0]:
                best = (hops + 1, [node_id, *path])
        in_progress.discard(node_id)
        longest_from[node_id] = best
        return best

    for node_id in graph.nodes:
        longest(node_id)

    if cycle_members:
        members = sorted(cycle_members)
        return [
            Finding(
                rule="sync_cycle",
                severity="error",
                message="Synchronous calls form a cycle",
                why=(
                    "A request in the cycle waits on itself: under load this "
                    "deadlocks or exhausts every thread pool involved."
                ),
                mitigation="Break the cycle — one of these calls must become "
                "asynchronous or disappear.",
                when_its_fine="It isn't. Async cycles can be fine; sync ones are not.",
                node_ids=members,
            )
        ]

    if not longest_from:  # empty board
        return []
    hops, path = max(longest_from.values(), key=lambda item: item[0])
    if hops <= MAX_SYNC_CHAIN:
        return []
    return [
        Finding(
            rule="deep_sync_chain",
            severity="warning",
            message=f"Requests traverse {hops} synchronous hops",
            why=(
                "Latency adds per hop and failure compounds — and a retry at "
                "each layer multiplies into a storm at the bottom."
            ),
            mitigation=(
                "Collapse layers that only forward, or cut the chain with a "
                "queue where a step doesn't need an immediate answer."
            ),
            when_its_fine=(
                "Every hop is doing real work and the end-to-end budget still "
                "closes; measure before flattening."
            ),
            node_ids=path,
        )
    ]


# -- 5. queue without failure handling ---------------------------------------


def queue_failure_handling(graph: BoardGraph) -> list[Finding]:
    """Dead-letter handling is read from the TOPOLOGY, not a flag: if the
    design has a DLQ, it should be an actual queue on the board, wired in.
    A queue "has" dead-letter handling when it (or one of its consumers)
    routes onward to a different queue; a queue in that DLQ position is
    itself exempt — its consumer is usually a human with an alert."""
    queues = {node.id for node in graph.of_kind(NodeKind.QUEUE)}

    def routes_to_a_queue(node_id: str, *, ignoring: str) -> bool:
        return any(
            edge.target in queues and edge.target != ignoring
            for edge in graph.out_edges[node_id]
        )

    def is_dlq(queue_id: str) -> bool:
        # Fed by another queue directly, or by a worker that drains one.
        for edge in graph.in_edges[queue_id]:
            feeder = graph.nodes[edge.source]
            if feeder.kind == NodeKind.QUEUE:
                return True
            if any(
                incoming.source in queues
                for incoming in graph.in_edges[feeder.id]
            ):
                return True
        return False

    findings = []
    for queue_id in queues:
        queue = graph.nodes[queue_id]
        if is_dlq(queue_id):
            continue
        consumers = [edge.target for edge in graph.out_edges[queue_id]]
        if not consumers:
            findings.append(
                Finding(
                    rule="queue_no_consumer",
                    severity="error",
                    message=f"{queue.label} has no consumer",
                    why="Messages go in and nothing comes out: work is accepted "
                    "and silently never done, forever.",
                    mitigation="Connect a worker (or whatever drains it).",
                    when_its_fine="It isn't — an unconsumed queue is a black hole.",
                    node_ids=[queue_id],
                )
            )
        elif not routes_to_a_queue(queue_id, ignoring=queue_id) and not any(
            routes_to_a_queue(consumer, ignoring=queue_id)
            for consumer in consumers
        ):
            findings.append(
                Finding(
                    rule="queue_no_dead_letter",
                    severity="warning",
                    message=f"{queue.label} has no dead-letter path",
                    why=(
                        "A message that always fails will be retried forever, "
                        "blocking the queue or silently vanishing depending on "
                        "the broker."
                    ),
                    mitigation=(
                        "Draw a second queue and route failures into it — an "
                        "edge from this queue (broker-level DLQ) or from its "
                        "worker — and alert on it."
                    ),
                    when_its_fine=(
                        "Fire-and-forget work where losing a poisoned message "
                        "is acceptable by design."
                    ),
                    node_ids=[queue_id],
                )
            )
    return findings


# -- 6-8. hygiene -------------------------------------------------------------


def orphan_nodes(graph: BoardGraph) -> list[Finding]:
    orphans = [
        node_id
        for node_id in graph.nodes
        if not graph.out_edges[node_id] and not graph.in_edges[node_id]
    ]
    if not orphans:
        return []
    return [
        Finding(
            rule="orphan_nodes",
            severity="suggestion",
            message=f"{len(orphans)} component(s) aren't connected to anything",
            why="A box with no edges says nothing about the system — nobody "
            "reading the diagram knows what it's for.",
            mitigation="Wire it in, or delete it.",
            when_its_fine="You're mid-sketch.",
            node_ids=orphans,
        )
    ]


def no_persistent_store(graph: BoardGraph) -> list[Finding]:
    if not graph.nodes or graph.of_kind(*PERSISTENT_KINDS):
        return []
    return [
        Finding(
            rule="no_persistence",
            severity="warning",
            message="Nothing in this system stores data durably",
            why="Every component here loses its contents on restart — one "
            "deploy and the system has amnesia.",
            mitigation="Add a database or object storage behind whatever owns "
            "the data.",
            when_its_fine="Pure compute or proxy systems that genuinely own no "
            "state.",
        )
    ]


def layering_violation(graph: BoardGraph) -> list[Finding]:
    forbidden = PERSISTENT_KINDS | {NodeKind.EXTERNAL_API}
    findings = []
    for edge in graph.edges:
        source = graph.nodes[edge.source]
        target = graph.nodes[edge.target]
        if source.kind in ENTRY_KINDS and target.kind in forbidden:
            secrets = "database credentials" if target.kind in PERSISTENT_KINDS else "API keys"
            findings.append(
                Finding(
                    rule="layering_violation",
                    severity="error",
                    message=f"{source.label} talks directly to {target.label}",
                    why=(
                        f"The client would hold {secrets}, and every rule you "
                        "can't enforce in a browser (authorization, validation, "
                        "rate limits) is now unenforced."
                    ),
                    mitigation="Route it through your API layer.",
                    when_its_fine=(
                        "Signed, scoped, expiring access (e.g. presigned upload "
                        "URLs) — which deserves its own box on the diagram."
                    ),
                    node_ids=[edge.source, edge.target],
                    edge_ids=[edge.id],
                )
            )
    return findings


ALL_RULES: list[Rule] = [
    single_point_of_failure,
    sync_fanout,
    deep_sync_chain,
    queue_failure_handling,
    orphan_nodes,
    no_persistent_store,
    layering_violation,
]

_SEVERITY_ORDER = {"error": 0, "warning": 1, "suggestion": 2}


def run_rules(graph: BoardGraph) -> list[Finding]:
    findings = [finding for rule in ALL_RULES for finding in rule(graph)]
    return sorted(findings, key=lambda finding: _SEVERITY_ORDER[finding.severity])
