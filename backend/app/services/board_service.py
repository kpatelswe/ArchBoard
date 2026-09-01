import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AccessDenied,
    InsufficientRole,
    NotFound,
    VersionConflict,
)
from app.models.board import Board
from app.models.membership import ROLE_RANK, BoardRole
from app.models.user import User
from app.repositories import board_repository, membership_repository
from app.schemas.snapshot import BoardSnapshot


async def create_board(session: AsyncSession, *, user: User, name: str) -> Board:
    return await board_repository.create(session, owner_id=user.id, name=name)


async def list_boards(
    session: AsyncSession, *, user: User
) -> list[tuple[Board, BoardRole]]:
    return await board_repository.list_for_member(session, user.id)


async def get_board_with_role(
    session: AsyncSession,
    *,
    user: User,
    board_id: uuid.UUID,
    minimum_role: BoardRole = BoardRole.VIEWER,
) -> tuple[Board, BoardRole]:
    """The single authorization gate for board access.

    Non-members get AccessDenied (mapped to 404 so existence is not leaked);
    members below `minimum_role` get InsufficientRole (mapped to 403).
    """
    board = await board_repository.get(session, board_id)
    if board is None:
        raise NotFound("board not found")

    role = await membership_repository.get_role(
        session, board_id=board_id, user_id=user.id
    )
    if role is None:
        raise AccessDenied("not a member of this board")
    if ROLE_RANK[role] < ROLE_RANK[minimum_role]:
        raise InsufficientRole(f"requires {minimum_role} role")
    return board, role


async def save_snapshot(
    session: AsyncSession,
    *,
    user: User,
    board_id: uuid.UUID,
    snapshot: BoardSnapshot,
    expected_version: int,
) -> Board:
    """Persist the graph. Editors and owners only; viewers are read-only."""
    board, _ = await get_board_with_role(
        session, user=user, board_id=board_id, minimum_role=BoardRole.EDITOR
    )

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
