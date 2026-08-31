import ssl
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

CONNECT_ARGS = {
    # asyncpg's string ssl modes resolve against libpq's ~/.postgresql/root.crt.
    "ssl": ssl.create_default_context(),
    # Required by Neon's transaction-mode pooler.
    "statement_cache_size": 0,
}

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args=CONNECT_ARGS,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
