import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.db import SessionLocal
from app.models.membership import ROLE_RANK, BoardRole
from app.realtime import events
from app.realtime.bus import bus
from app.realtime.manager import BoardConnection, manager
from app.realtime.state import registry
from app.realtime.tickets import verify_ticket
from app.repositories import membership_repository

router = APIRouter()

# App-level close codes live in the 4000-4999 range the WebSocket spec
# reserves for private use; 1000-3999 belong to the protocol and registries.
CLOSE_UNAUTHENTICATED = 4401
CLOSE_FORBIDDEN = 4403

MAX_FRAME_BYTES = 64_000

# Identifies this backend process on the bus, so a process can tell its own
# published events (already applied locally) from another process's.
PROCESS_ID = uuid.uuid4().hex

MUTATION_TYPES = events.STRUCTURAL_TYPES | {"node.updated", "edge.updated"}


async def _publish(
    board_id: uuid.UUID, payload: dict, *, exclude_connection_id: str | None = None
) -> None:
    await bus.publish(
        board_id,
        {"origin": PROCESS_ID, "exclude": exclude_connection_id, "payload": payload},
    )


async def _on_bus_message(board_id: uuid.UUID, message: dict) -> None:
    """Runs on every subscribed process, including the one that published."""
    payload = message["payload"]

    # A mutation from ANOTHER process must be applied to this process's copy
    # of the board, or its joiners and flushes would use a stale graph. Our
    # own events were applied before publishing. mark_dirty=False: only the
    # origin process persists a mutation.
    if message["origin"] != PROCESS_ID and payload["type"] in MUTATION_TYPES:
        state = registry.peek(board_id)
        if state is not None:
            try:
                event = events.inbound_adapter.validate_python(payload)
                state.apply(event, mark_dirty=False)
            except ValidationError:
                pass  # a foreign process sent junk; don't crash the reader

    await manager.broadcast(
        board_id, payload, exclude_connection_id=message.get("exclude")
    )


@router.websocket("/ws/boards/{board_id}")
async def board_websocket(websocket: WebSocket, board_id: uuid.UUID) -> None:
    # Accept first: rejecting before accept surfaces as a bare HTTP 403 with
    # no close code, which the browser reports uselessly. Accepting and then
    # closing lets the client read *why*.
    await websocket.accept()

    user_id = verify_ticket(
        websocket.query_params.get("ticket", ""), board_id=board_id
    )
    if user_id is None:
        await websocket.close(CLOSE_UNAUTHENTICATED, "invalid or expired ticket")
        return

    # The ticket proved identity; membership is re-checked live so a role
    # change between mint and connect is honored. The session is opened and
    # closed around this one query — never held for the socket's lifetime.
    async with SessionLocal() as session:
        role = await membership_repository.get_role(
            session, board_id=board_id, user_id=user_id
        )
    if role is None:
        await websocket.close(CLOSE_FORBIDDEN, "not a member of this board")
        return

    state = await registry.acquire(board_id)
    connection = BoardConnection(
        websocket=websocket,
        connection_id=uuid.uuid4().hex,
        user_id=user_id,
        role=role,
    )
    manager.add(board_id, connection)
    if manager.count(board_id) == 1:
        await bus.subscribe(board_id, _on_bus_message)

    try:
        await websocket.send_json(
            {
                "type": "connected",
                "connection_id": connection.connection_id,
                "role": role,
                # Process-local until presence lands (C12).
                "peer_count": manager.count(board_id),
                # The live server state may be ahead of what the client
                # fetched over REST; hand it the truth at join.
                "snapshot": state.to_snapshot(),
                "version": state.version,
            }
        )
        await _publish(
            board_id,
            {
                "type": "board.joined",
                "user_id": str(user_id),
                "peer_count": manager.count(board_id),
            },
            exclude_connection_id=connection.connection_id,
        )

        while True:
            raw = await websocket.receive_text()
            if len(raw) > MAX_FRAME_BYTES:
                await websocket.send_json(events.error_frame("frame too large"))
                continue

            try:
                event = events.inbound_adapter.validate_json(raw)
            except ValidationError as error:
                await websocket.send_json(
                    events.error_frame(f"invalid event: {error.error_count()} errors")
                )
                continue

            # Cursor traffic is ephemeral: any member may send, nothing is
            # applied or persisted — pure relay.
            if isinstance(event, events.CursorMoved):
                await _publish(
                    board_id,
                    events.outbound(event, user_id=user_id),
                    exclude_connection_id=connection.connection_id,
                )
                continue

            # Everything else mutates the board: the role captured at connect
            # gates it with zero database work on the hot path.
            if ROLE_RANK[connection.role] < ROLE_RANK[BoardRole.EDITOR]:
                await websocket.send_json(
                    events.error_frame("viewers cannot mutate the board")
                )
                continue

            if not state.apply(event):
                await websocket.send_json(
                    events.error_frame(f"{event.type} rejected: stale target")
                )
                continue

            state.schedule_flush(structural=event.type in events.STRUCTURAL_TYPES)
            await _publish(
                board_id,
                events.outbound(event, user_id=user_id),
                exclude_connection_id=connection.connection_id,
            )
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(board_id, connection)
        if manager.count(board_id) == 0:
            await bus.unsubscribe(board_id)
        await registry.release(board_id, manager.count(board_id))
        await _publish(
            board_id,
            {
                "type": "board.left",
                "user_id": str(user_id),
                "peer_count": manager.count(board_id),
            },
        )
