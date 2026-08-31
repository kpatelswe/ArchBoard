from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_by_clerk_id(session: AsyncSession, clerk_user_id: str) -> User | None:
    result = await session.execute(
        select(User).where(User.clerk_user_id == clerk_user_id)
    )
    return result.scalar_one_or_none()


async def upsert_by_clerk_id(
    session: AsyncSession,
    *,
    clerk_user_id: str,
    email: str,
    name: str | None,
    avatar_url: str | None,
) -> User:
    """Insert the user, or refresh their profile if they already exist.

    Done as a single atomic statement: two concurrent logins for a new account
    would both see "no row" in a check-then-insert and one would fail on the
    unique constraint.
    """
    statement = (
        insert(User)
        .values(
            clerk_user_id=clerk_user_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
        )
        .on_conflict_do_update(
            index_elements=[User.clerk_user_id],
            # onupdate= does not fire for a core insert, so bump it explicitly.
            set_={
                "email": email,
                "name": name,
                "avatar_url": avatar_url,
                "updated_at": func.now(),
            },
        )
        .returning(User)
    )
    result = await session.execute(statement)
    await session.commit()
    return result.scalar_one()
