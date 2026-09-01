import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.models.board import Board
from app.models.invite import BoardInvite
from app.models.membership import BoardRole
from app.models.user import User
from app.repositories import board_repository, invite_repository, membership_repository
from app.services.board_service import get_board_with_role


def _hash_token(token: str) -> str:
    # Plain SHA-256, no salt or work factor: unlike a password, the token is
    # 256 bits of pure randomness, so it cannot be brute-forced from its hash.
    return hashlib.sha256(token.encode()).hexdigest()


async def create_invite(
    session: AsyncSession,
    *,
    user: User,
    board_id: uuid.UUID,
    role: BoardRole,
    expires_in_hours: int | None,
) -> tuple[BoardInvite, str]:
    """Owner-only. Returns the invite row and the raw token — the only time
    the token ever exists outside the recipient's link."""
    await get_board_with_role(
        session, user=user, board_id=board_id, minimum_role=BoardRole.OWNER
    )
    if role == BoardRole.OWNER:
        raise ValueError("invites may grant editor or viewer only")

    token = secrets.token_urlsafe(32)
    invite = await invite_repository.create(
        session,
        board_id=board_id,
        token_hash=_hash_token(token),
        role=role,
        created_by=user.id,
        expires_at=(
            datetime.now(UTC) + timedelta(hours=expires_in_hours)
            if expires_in_hours
            else None
        ),
    )
    return invite, token


async def accept_invite(
    session: AsyncSession, *, user: User, token: str
) -> Board:
    """Validate the token and add the caller as a member.

    Every failure mode raises the same NotFound: an attacker probing tokens
    learns nothing about whether one exists, expired, or was revoked.
    """
    invite = await invite_repository.get_by_token_hash(session, _hash_token(token))
    if (
        invite is None
        or invite.revoked_at is not None
        or (invite.expires_at is not None and invite.expires_at < datetime.now(UTC))
    ):
        raise NotFound("invite not found")

    await membership_repository.add_member(
        session,
        board_id=invite.board_id,
        user_id=user.id,
        role=BoardRole(invite.role),
    )
    board = await board_repository.get(session, invite.board_id)
    if board is None:  # board deleted after invite creation
        raise NotFound("invite not found")
    return board


async def list_invites(
    session: AsyncSession, *, user: User, board_id: uuid.UUID
) -> list[BoardInvite]:
    await get_board_with_role(
        session, user=user, board_id=board_id, minimum_role=BoardRole.OWNER
    )
    return await invite_repository.list_for_board(session, board_id)


async def revoke_invite(
    session: AsyncSession, *, user: User, board_id: uuid.UUID, invite_id: uuid.UUID
) -> None:
    await get_board_with_role(
        session, user=user, board_id=board_id, minimum_role=BoardRole.OWNER
    )
    if not await invite_repository.revoke(
        session, board_id=board_id, invite_id=invite_id
    ):
        raise NotFound("invite not found")
