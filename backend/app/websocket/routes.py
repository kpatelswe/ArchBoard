import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.db import SessionLocal
from app.realtime.manager import BoardConnection, manager
from app.realtime.tickets import verify_ticket
from app.repositories import membership_repository

router = APIRouter()

# App-level close codes live in the 4000-4999 range the WebSocket spec
# reserves for private use; 1000-3999 belong to the protocol and registries.
CLOSE_UNAUTHENTICATED = 4401
CLOSE_FORBIDDEN = 4403


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

    connection = BoardConnection(
        websocket=websocket,
        connection_id=uuid.uuid4().hex,
        user_id=user_id,
        role=role,
    )
    manager.add(board_id, connection)

    try:
        await websocket.send_json(
            {
                "type": "connected",
                "connection_id": connection.connection_id,
                "role": role,
                "peer_count": manager.count(board_id),
            }
        )
        await manager.broadcast(
            board_id,
            {
                "type": "board.joined",
                "user_id": str(user_id),
                "peer_count": manager.count(board_id),
            },
            exclude=connection,
        )

        while True:
            # Inbound events are validated and routed in C9; until then the
            # loop only serves to detect disconnection.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(board_id, connection)
        await manager.broadcast(
            board_id,
            {
                "type": "board.left",
                "user_id": str(user_id),
                "peer_count": manager.count(board_id),
            },
        )
