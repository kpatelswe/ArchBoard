import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import Board


async def create(session: AsyncSession, *, owner_id: uuid.UUID, name: str) -> Board:
    board = Board(owner_id=owner_id, name=name)
    session.add(board)
    await session.commit()
    await session.refresh(board)
    return board


async def get(session: AsyncSession, board_id: uuid.UUID) -> Board | None:
    return await session.get(Board, board_id)


async def list_for_owner(session: AsyncSession, owner_id: uuid.UUID) -> list[Board]:
    result = await session.execute(
        select(Board)
        .where(Board.owner_id == owner_id)
        .order_by(Board.updated_at.desc())
    )
    return list(result.scalars().all())
