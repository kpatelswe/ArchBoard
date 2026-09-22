import base64
import logging
import uuid
from collections.abc import Awaitable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.db import SessionLocal
from app.models.membership import ROLE_RANK, BoardRole
from app.realtime import events
from app.realtime import presence, rate_limit
from app.realtime.bus import bus
from app.realtime.manager import BoardConnection, manager
from app.realtime.state import registry
from app.auth.dependencies import verify_session_token
from app.repositories import membership_repository, user_repository

router = APIRouter()
logger = logging.getLogger(__name__)

# App-level close codes live in the 4000-4999 range the WebSocket spec
# reserves for private use; 1000-3999 belong to the protocol and registries.
CLOSE_UNAUTHENTICATED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_RATE_LIMITED = 4429  # mirrors HTTP 429

# Backstop only: uvicorn enforces the same cap (--ws-max-size in the
# Dockerfile) before a frame is allocated. This check runs after the frame is
# already in memory, so it protects nothing on its own; it stays so that a
# dev server started without the flag still refuses oversized frames.
MAX_FRAME_BYTES = 64_000

# Identifies this backend process on the bus, so a process can tell its own
# published events (already applied locally) from another process's.
PROCESS_ID = uuid.uuid4().hex

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

    # CRDT updates ride the JSON bus base64-encoded. An update from ANOTHER
    # process merges into this process's replica (mark_dirty=False: only the
    # origin persists); our own updates were applied before publishing.
    # Either way the raw bytes fan out to local sockets as binary frames.
    if payload.get("type") == "ydoc.update":
        update = base64.b64decode(payload["b64"])
        if message["origin"] != PROCESS_ID:
            state = registry.peek(board_id)
            if state is not None:
                try:
                    state.apply_update(update, mark_dirty=False)
                except Exception:
                    return  # a foreign process sent junk; don't relay it
        await manager.broadcast_bytes(
            board_id, update, exclude_connection_id=message.get("exclude")
        )
        return

    await manager.broadcast(
        board_id, payload, exclude_connection_id=message.get("exclude")
    )


@router.websocket("/ws/boards/{board_id}")
async def board_websocket(websocket: WebSocket, board_id: uuid.UUID) -> None:
    # Accept first: rejecting before accept surfaces as a bare HTTP 403 with
    # no close code, which the browser reports uselessly. Accepting and then
    # closing lets the client read *why*.
    await websocket.accept()

    # Browser WebSockets cannot set headers, so the Clerk token rides the
    # query string. It is short-lived (~60s) and the socket outlives it —
    # it only authenticates the handshake.
    clerk_user_id = verify_session_token(websocket.query_params.get("token", ""))
    if clerk_user_id is None:
        await websocket.close(CLOSE_UNAUTHENTICATED, "invalid or expired token")
        return

    # One short-lived session for the auth queries — never held for the
    # socket's lifetime.
    async with SessionLocal() as session:
        user = await user_repository.get_by_clerk_id(session, clerk_user_id)
        role = (
            await membership_repository.get_role(
                session, board_id=board_id, user_id=user.id
            )
            if user
            else None
        )
    if user is None or role is None:
        await websocket.close(CLOSE_FORBIDDEN, "not a member of this board")
        return
    user_id = user.id

    await presence.mark(
        board_id, user_id, name=user.name, avatar_url=user.avatar_url
    )

    state = await registry.acquire(board_id)
    connection = BoardConnection(
        websocket=websocket,
        connection_id=uuid.uuid4().hex,
        user_id=user_id,
        role=role,
    )

    # Everything from the first registration onward runs under the finally:
    # if the bus subscribe (a Redis round-trip) fails after manager.add, the
    # connection and the board's CRDT state would otherwise stay registered
    # forever, since only the teardown releases them.
    try:
        manager.add(board_id, connection)
        if manager.count(board_id) == 1:
            await bus.subscribe(board_id, _on_bus_message)

        await websocket.send_json(
            {
                "type": "connected",
                "connection_id": connection.connection_id,
                "role": role,
                "presence": await presence.roster(board_id),
                # The full CRDT document as one update. The client merges it
                # into its replica and then sends its own full state back, so
                # edits made while disconnected survive a reconnect in both
                # directions — no remount, no snapshot adoption.
                "ydoc": base64.b64encode(state.encoded_state()).decode(),
                "version": state.version,
            }
        )
        await _publish(
            board_id,
            {
                "type": "board.joined",
                "user_id": str(user_id),
                "name": user.name,
                "avatar_url": user.avatar_url,
            },
            exclude_connection_id=connection.connection_id,
        )

        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            update: bytes | None = message.get("bytes")
            raw: str | None = message.get("text")
            if len(update or "") > MAX_FRAME_BYTES or len(raw or "") > MAX_FRAME_BYTES:
                await websocket.send_json(events.error_frame("frame too large"))
                continue

            count = await rate_limit.register_event(user_id, board_id)
            action = rate_limit.verdict(count)
            if action == "disconnect":
                # Sustained flooding: stop paying to read this socket at all.
                await websocket.close(CLOSE_RATE_LIMITED, "rate limit exceeded")
                break
            if action == "drop":
                # Warn exactly once per window, then drop silently — replying
                # to every flooded frame would amplify the flood.
                if count == rate_limit.MAX_EVENTS_PER_WINDOW + 1:
                    await websocket.send_json(
                        events.error_frame("rate limited: slow down")
                    )
                continue

            # Binary frames are CRDT updates — the entire mutation surface.
            # The server can gate WHO writes (role, captured at connect) but
            # no longer inspects WHAT changed: that is the price of merges.
            if update is not None:
                if ROLE_RANK[connection.role] < ROLE_RANK[BoardRole.EDITOR]:
                    await websocket.send_json(
                        events.error_frame("viewers cannot mutate the board")
                    )
                    continue
                try:
                    state.apply_update(update)
                except Exception:
                    await websocket.send_json(
                        events.error_frame("malformed CRDT update")
                    )
                    continue
                state.schedule_flush()
                await _publish(
                    board_id,
                    {"type": "ydoc.update", "b64": base64.b64encode(update).decode()},
                    exclude_connection_id=connection.connection_id,
                )
                continue
            if raw is None:
                continue

            try:
                event = events.inbound_adapter.validate_json(raw)
            except ValidationError as error:
                await websocket.send_json(
                    events.error_frame(f"invalid event: {error.error_count()} errors")
                )
                continue

            if isinstance(event, events.PresencePing):
                await presence.mark(
                    board_id, user_id, name=user.name, avatar_url=user.avatar_url
                )
                continue

            # Editing awareness is a pure relay like cursors — no state, no
            # denial (the CRDT merges concurrent edits); it only paints the
            # highlight on other screens. Editors only: a viewer cannot be
            # "editing" anything.
            if isinstance(event, (events.EditingStarted, events.EditingStopped)):
                if ROLE_RANK[connection.role] < ROLE_RANK[BoardRole.EDITOR]:
                    continue
                await _publish(
                    board_id,
                    {**events.outbound(event, user_id=user_id), "name": user.name},
                    exclude_connection_id=connection.connection_id,
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
    except WebSocketDisconnect:
        pass
    finally:
        await _teardown(board_id, connection)


async def _teardown(board_id: uuid.UUID, connection: BoardConnection) -> None:
    """Undo everything connect registered, even when a step fails.

    Each step is independent, and every one after the local remove talks to
    Redis or Postgres. If one raised straight through, the ones after it
    would be skipped: a failed unsubscribe would leave the board's CRDT
    state (and its pending flush task) in the registry for the life of the
    process. So each step is attempted regardless of the others; failures
    are logged, not propagated, because the socket is already gone and
    there is nobody left to report them to.
    """
    manager.remove(board_id, connection)
    if manager.count(board_id) == 0:
        await _attempt("bus.unsubscribe", bus.unsubscribe(board_id))
    await _attempt(
        "registry.release", registry.release(board_id, manager.count(board_id))
    )
    await _attempt("presence.clear", presence.clear(board_id, connection.user_id))
    await _attempt(
        "publish board.left",
        _publish(board_id, {"type": "board.left", "user_id": str(connection.user_id)}),
    )


async def _attempt(what: str, step: Awaitable[None]) -> None:
    try:
        await step
    except Exception:
        logger.exception("websocket teardown step failed: %s", what)
