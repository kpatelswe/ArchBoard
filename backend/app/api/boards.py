import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import (
    AccessDenied,
    InsufficientRole,
    NotFound,
    VersionConflict,
)
from app.models.board import Board
from app.models.membership import BoardRole
from app.schemas.board import (
    BoardConflict,
    BoardCreate,
    BoardRead,
    BoardSnapshotUpdate,
    BoardSummary,
    InviteCreate,
    InviteCreated,
    InviteRead,
)
from app.realtime.tickets import TICKET_TTL_SECONDS, mint_ticket
from app.services import board_service, invite_service

router = APIRouter(prefix="/api/boards", tags=["boards"])


def _with_role(board: Board, role: BoardRole | None) -> BoardRead:
    return BoardRead.model_validate(board).model_copy(update={"role": role})


def _not_found() -> HTTPException:
    # Non-members and nonexistent boards look identical on purpose.
    return HTTPException(status.HTTP_404_NOT_FOUND, "board not found")


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
async def create_board(payload: BoardCreate, user: CurrentUser, session: DbSession):
    board = await board_service.create_board(session, user=user, name=payload.name)
    return _with_role(board, BoardRole.OWNER)


@router.get("", response_model=list[BoardSummary])
async def list_boards(user: CurrentUser, session: DbSession):
    return [
        BoardSummary.model_validate(board).model_copy(update={"role": role})
        for board, role in await board_service.list_boards(session, user=user)
    ]


@router.get("/{board_id}", response_model=BoardRead)
async def get_board(board_id: uuid.UUID, user: CurrentUser, session: DbSession):
    try:
        board, role = await board_service.get_board_with_role(
            session, user=user, board_id=board_id
        )
        return _with_role(board, role)
    except (NotFound, AccessDenied):
        raise _not_found()


@router.put(
    "/{board_id}/snapshot",
    response_model=BoardRead,
    responses={409: {"model": BoardConflict}},
)
async def save_snapshot(
    board_id: uuid.UUID,
    payload: BoardSnapshotUpdate,
    user: CurrentUser,
    session: DbSession,
):
    try:
        board = await board_service.save_snapshot(
            session,
            user=user,
            board_id=board_id,
            snapshot=payload.snapshot,
            expected_version=payload.version,
        )
        return BoardRead.model_validate(board)
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "viewers cannot edit")
    except VersionConflict:
        board, role = await board_service.get_board_with_role(
            session, user=user, board_id=board_id
        )
        # Return the winning state alongside the 409 so the client can
        # reconcile without a second round-trip.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "detail": "board was modified by someone else",
                "current": _with_role(board, role).model_dump(mode="json"),
            },
        )


@router.post("/{board_id}/ws-ticket")
async def create_ws_ticket(
    board_id: uuid.UUID, user: CurrentUser, session: DbSession
):
    """Exchange the (header-borne) Clerk token for a short-lived socket ticket.

    Any member may connect — viewers included; they receive but cannot mutate.
    """
    try:
        await board_service.get_board_with_role(
            session, user=user, board_id=board_id
        )
    except (NotFound, AccessDenied):
        raise _not_found()
    return {
        "ticket": mint_ticket(user_id=user.id, board_id=board_id),
        "expires_in": TICKET_TTL_SECONDS,
    }


@router.post(
    "/{board_id}/invites",
    response_model=InviteCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    board_id: uuid.UUID,
    payload: InviteCreate,
    user: CurrentUser,
    session: DbSession,
):
    try:
        invite, token = await invite_service.create_invite(
            session,
            user=user,
            board_id=board_id,
            role=payload.role,
            expires_in_hours=payload.expires_in_hours,
        )
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can share")
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error))
    return InviteCreated(**InviteRead.model_validate(invite).model_dump(), token=token)


@router.get("/{board_id}/invites", response_model=list[InviteRead])
async def list_invites(board_id: uuid.UUID, user: CurrentUser, session: DbSession):
    try:
        return await invite_service.list_invites(
            session, user=user, board_id=board_id
        )
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can share")


@router.delete(
    "/{board_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_invite(
    board_id: uuid.UUID,
    invite_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
):
    try:
        await invite_service.revoke_invite(
            session, user=user, board_id=board_id, invite_id=invite_id
        )
    except (NotFound, AccessDenied):
        raise _not_found()
    except InsufficientRole:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can share")
