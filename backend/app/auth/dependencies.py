from datetime import UTC, datetime, timedelta

from clerk_backend_api import AuthenticateRequestOptions, Clerk, authenticate_request
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.models.user import User
from app.repositories import user_repository

settings = get_settings()

_clerk = Clerk(bearer_auth=settings.clerk_secret_key)

PROFILE_MAX_AGE = timedelta(days=1)


def _verify(request: Request) -> str:
    """Verify the Clerk session token and return the Clerk user id."""
    state = authenticate_request(
        request,
        AuthenticateRequestOptions(
            secret_key=settings.clerk_secret_key,
            authorized_parties=[settings.frontend_origin],
            accepts_token=["session_token"],
        ),
    )
    if not state.is_signed_in:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=state.reason.name if state.reason else "not authenticated",
        )
    return state.payload["sub"]


async def get_current_user(
    request: Request, session: AsyncSession = Depends(get_session)
) -> User:
    """Resolve the caller to a local user row, creating it on first login."""
    clerk_user_id = _verify(request)

    user = await user_repository.get_by_clerk_id(session, clerk_user_id)
    # Presence shows names/avatars, so refresh profiles older than a day —
    # the upsert below refreshes; it was just never called a second time.
    if user is not None and datetime.now(UTC) - user.updated_at < PROFILE_MAX_AGE:
        return user

    try:
        profile = _clerk.users.get(user_id=clerk_user_id)
    except Exception:
        profile = None
    if profile is None:
        if user is not None:
            return user  # Clerk hiccup: stale profile beats a failed request
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="unknown user"
        )

    primary_email = next(
        (
            address.email_address
            for address in (profile.email_addresses or [])
            if address.id == profile.primary_email_address_id
        ),
        None,
    )
    full_name = " ".join(filter(None, [profile.first_name, profile.last_name])) or None

    return await user_repository.upsert_by_clerk_id(
        session,
        clerk_user_id=clerk_user_id,
        email=primary_email or "",
        name=full_name,
        avatar_url=profile.image_url,
    )
