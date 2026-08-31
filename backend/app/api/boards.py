import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AccessDenied, NotFound
from app.schemas.board import BoardCreate, BoardRead, BoardSummary
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
