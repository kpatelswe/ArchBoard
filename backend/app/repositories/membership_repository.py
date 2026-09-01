import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import BoardMember, BoardRole


async def get_role(
    session: AsyncSession, *, board_id: uuid.UUID, user_id: uuid.UUID
) -> BoardRole | None:
    result = await session.execute(
        select(BoardMember.role).where(
            BoardMember.board_id == board_id, BoardMember.user_id == user_id
        )
    )
    role = result.scalar_one_or_none()
    return BoardRole(role) if role else None


async def add_member(
    session: AsyncSession,
    *,
    board_id: uuid.UUID,
    user_id: uuid.UUID,
    role: BoardRole,
) -> None:
    """Idempotent: accepting an invite twice, or while already a member,
    never errors and never downgrades an existing role."""
    await session.execute(
        insert(BoardMember)
        .values(board_id=board_id, user_id=user_id, role=role)
        .on_conflict_do_nothing(index_elements=["board_id", "user_id"])
    )
    await session.commit()


async def list_members(
    session: AsyncSession, *, board_id: uuid.UUID
) -> list[BoardMember]:
    result = await session.execute(
        select(BoardMember)
        .where(BoardMember.board_id == board_id)
        .order_by(BoardMember.created_at)
    )
    return list(result.scalars().all())
