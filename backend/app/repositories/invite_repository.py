import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invite import BoardInvite


async def create(
    session: AsyncSession,
    *,
    board_id: uuid.UUID,
    token_hash: str,
    role: str,
    created_by: uuid.UUID,
    expires_at: datetime | None,
) -> BoardInvite:
    invite = BoardInvite(
        board_id=board_id,
        token_hash=token_hash,
        role=role,
        created_by=created_by,
        expires_at=expires_at,
    )
    session.add(invite)
    await session.commit()
    await session.refresh(invite)
    return invite


async def get_by_token_hash(
    session: AsyncSession, token_hash: str
) -> BoardInvite | None:
    result = await session.execute(
        select(BoardInvite).where(BoardInvite.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def list_for_board(
    session: AsyncSession, board_id: uuid.UUID
) -> list[BoardInvite]:
    result = await session.execute(
        select(BoardInvite)
        .where(BoardInvite.board_id == board_id)
        .order_by(BoardInvite.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke(
    session: AsyncSession, *, board_id: uuid.UUID, invite_id: uuid.UUID
) -> bool:
    """Idempotent revoke; returns False when no such invite exists."""
    result = await session.execute(
        update(BoardInvite)
        .where(BoardInvite.id == invite_id, BoardInvite.board_id == board_id)
        .values(revoked_at=func.coalesce(BoardInvite.revoked_at, func.now()))
        .returning(BoardInvite.id)
    )
    await session.commit()
    return result.scalar_one_or_none() is not None
