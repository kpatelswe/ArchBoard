import uuid

from sqlalchemy import func, select, update
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


async def update_snapshot(
    session: AsyncSession,
    *,
    board_id: uuid.UUID,
    snapshot: dict,
    expected_version: int,
) -> Board | None:
    """Compare-and-swap on version. Returns None if another writer won.

    The guard is inside the UPDATE, so the check and the write are one
    statement and no lock is needed.
    """
    result = await session.execute(
        update(Board)
        .where(Board.id == board_id, Board.version == expected_version)
        .values(
            current_snapshot=snapshot,
            version=Board.version + 1,
            updated_at=func.now(),
        )
        .returning(Board)
    )
    board = result.scalar_one_or_none()
    await session.commit()
    return board


async def list_for_owner(session: AsyncSession, owner_id: uuid.UUID) -> list[Board]:
    result = await session.execute(
        select(Board)
        .where(Board.owner_id == owner_id)
        .order_by(Board.updated_at.desc())
    )
    return list(result.scalars().all())
