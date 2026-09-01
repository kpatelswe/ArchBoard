import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AccessDenied, NotFound, VersionConflict
from app.schemas.board import (
    BoardConflict,
    BoardCreate,
    BoardRead,
    BoardSnapshotUpdate,
    BoardSummary,
)
from app.services import board_service

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
async def create_board(payload: BoardCreate, user: CurrentUser, session: DbSession):
    return await board_service.create_board(session, user=user, name=payload.name)


@router.get("", response_model=list[BoardSummary])
async def list_boards(user: CurrentUser, session: DbSession):
    return await board_service.list_boards(session, user=user)


@router.get("/{board_id}", response_model=BoardRead)
async def get_board(board_id: uuid.UUID, user: CurrentUser, session: DbSession):
    try:
        return await board_service.get_board(session, user=user, board_id=board_id)
    except (NotFound, AccessDenied):
        # 404 for both: a stranger should not learn that the board exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "board not found")


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
        return await board_service.save_snapshot(
            session,
            user=user,
            board_id=board_id,
            snapshot=payload.snapshot,
            expected_version=payload.version,
        )
    except (NotFound, AccessDenied):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "board not found")
    except VersionConflict:
        current = await board_service.get_board(
            session, user=user, board_id=board_id
        )
        # Return the winning state alongside the 409 so the client can
        # reconcile without a second round-trip.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "detail": "board was modified by someone else",
                "current": BoardRead.model_validate(current).model_dump(mode="json"),
            },
        )
