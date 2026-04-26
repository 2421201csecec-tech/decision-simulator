from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


def _build_engine():
    url = settings.database_url
    if url.startswith("postgresql"):
        connect_args: dict = {"ssl": "require"}
        if ":6543" in url:
            # PgBouncer transaction mode — disables prepared statement caching
            connect_args["statement_cache_size"] = 0
        return create_async_engine(url, echo=False, connect_args=connect_args)
    return create_async_engine(url, echo=False)


engine = _build_engine()
_session_factory = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def get_async_session() -> AsyncSession:
    async with _session_factory() as session:
        yield session
