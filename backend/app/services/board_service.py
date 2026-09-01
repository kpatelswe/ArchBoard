import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AccessDenied, NotFound, VersionConflict
from app.models.board import Board
from app.models.user import User
from app.repositories import board_repository
from app.schemas.snapshot import BoardSnapshot


async def create_board(session: AsyncSession, *, user: User, name: str) -> Board:
    return await board_repository.create(session, owner_id=user.id, name=name)


async def list_boards(session: AsyncSession, *, user: User) -> list[Board]:
    return await board_repository.list_for_owner(session, user.id)


async def save_snapshot(
    session: AsyncSession,
    *,
    user: User,
    board_id: uuid.UUID,
    snapshot: BoardSnapshot,
    expected_version: int,
) -> Board:
    """Persist the graph, refusing to overwrite a newer version."""
    board = await get_board(session, user=user, board_id=board_id)

    saved = await board_repository.update_snapshot(
        session,
        board_id=board.id,
        # mode="json" so enums and floats become JSON primitives asyncpg can
        # hand to a JSONB column.
        snapshot=snapshot.model_dump(mode="json"),
        expected_version=expected_version,
    )
    if saved is None:
        raise VersionConflict("board was modified by someone else")
    return saved


async def get_board(
    session: AsyncSession, *, user: User, board_id: uuid.UUID
) -> Board:
    board = await board_repository.get(session, board_id)
    if board is None:
        raise NotFound("board not found")
    if board.owner_id != user.id:
        raise AccessDenied("not a member of this board")
    return board
