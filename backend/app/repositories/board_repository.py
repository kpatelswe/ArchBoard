import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import Board
from app.models.membership import BoardMember, BoardRole


async def create(session: AsyncSession, *, owner_id: uuid.UUID, name: str) -> Board:
    """Create the board and its owner membership in one transaction.

    A crash between the two inserts must not leave a board no one can access,
    so there is exactly one commit.
    """
    board = Board(owner_id=owner_id, name=name)
    session.add(board)
    await session.flush()  # assigns board.id without committing
    session.add(
        BoardMember(board_id=board.id, user_id=owner_id, role=BoardRole.OWNER)
    )
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
    ydoc_state: bytes | None = None,
) -> Board | None:
    """Compare-and-swap on version. Returns None if another writer won.

    The guard is inside the UPDATE, so the check and the write are one
    statement and no lock is needed.

    ydoc_state=None (the REST path) deliberately CLEARS the stored CRDT doc:
    a JSON save has no CRDT history, so the next live session must re-seed
    its doc from this snapshot instead of merging against a stale one.
    """
    result = await session.execute(
        update(Board)
        .where(Board.id == board_id, Board.version == expected_version)
        .values(
            current_snapshot=snapshot,
            ydoc_state=ydoc_state,
            version=Board.version + 1,
            updated_at=func.now(),
        )
        .returning(Board)
    )
    board = result.scalar_one_or_none()
    await session.commit()
    return board


async def list_for_member(
    session: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Board, BoardRole]]:
    """Boards this user belongs to, owned or shared, with their role."""
    result = await session.execute(
        select(Board, BoardMember.role)
        .join(BoardMember, BoardMember.board_id == Board.id)
        .where(BoardMember.user_id == user_id)
        .order_by(Board.updated_at.desc())
    )
    return [(board, BoardRole(role)) for board, role in result.all()]
