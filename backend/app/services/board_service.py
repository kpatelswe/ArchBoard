import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AccessDenied, NotFound
from app.models.board import Board
from app.models.user import User
from app.repositories import board_repository


async def create_board(session: AsyncSession, *, user: User, name: str) -> Board:
    return await board_repository.create(session, owner_id=user.id, name=name)


async def list_boards(session: AsyncSession, *, user: User) -> list[Board]:
    return await board_repository.list_for_owner(session, user.id)


async def get_board(
    session: AsyncSession, *, user: User, board_id: uuid.UUID
) -> Board:
    board = await board_repository.get(session, board_id)
    if board is None:
        raise NotFound("board not found")
    if board.owner_id != user.id:
        raise AccessDenied("not a member of this board")
    return board
