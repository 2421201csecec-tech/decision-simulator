from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes.admin import router as admin_router
from app.api.routes.clarify_draft import router as clarify_draft_router
from app.extraction.api import router as extraction_router
from app.api.routes.decision_output import router as decision_output_router
from app.api.routes.export import router as export_router
from app.api.routes.failure_analysis import router as failure_analysis_router
from app.api.routes.health import router as health_router
from app.api.routes.pressure_test import router as pressure_test_router
from app.api.routes.simulation import router as simulation_router
from app.api.routes.threads import router as threads_router
from app.api.routes.user import router as user_router
from app.config import settings
from app.db.engine import engine, get_async_session
from app.logging_config import configure_logging
from app.models.decision import Base

configure_logging(settings.log_level)
logger = logging.getLogger("app.main")

_SCHEDULER_LOCK_ID = 987654321  # stable advisory lock ID for scheduler leader election
_scheduler = None


async def _start_decay_scheduler() -> None:
    """Start APScheduler in one worker only (advisory lock leader election)."""
    global _scheduler
    from app.pattern_engine.constants import ENABLE_DECAY_WORKER
    if not settings.pattern_engine_enabled or not ENABLE_DECAY_WORKER:
        return
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import]
    except ImportError:
        logger.warning("apscheduler not installed — decay worker will not run (pip install apscheduler)")
        return

    async with get_async_session() as session:
        acquired = await session.scalar(
            text("SELECT pg_try_advisory_lock(:lid)").bindparams(lid=_SCHEDULER_LOCK_ID)
        )
    if not acquired:
        logger.info("scheduler leader lock not acquired — APScheduler not started in this worker")
        return

    from app.pattern_engine.decay_worker import run_decay_pass
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(run_decay_pass, "cron", hour=2, minute=0, timezone="UTC")
    _scheduler.start()
    logger.info("APScheduler started (decay worker) — this worker is scheduler leader")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _start_decay_scheduler()
    try:
        from app.storage.thread_store import cleanup_empty_threads
        deleted = await cleanup_empty_threads(older_than_hours=24)
        if deleted:
            logger.info("startup cleanup: deleted %d empty threads", deleted)
    except Exception:
        logger.warning("startup cleanup failed — skipping", exc_info=True)
    yield
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
    await engine.dispose()

# Initialize FastAPI app and include all routers

from app.middleware.auth import JWTAuthMiddleware

app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(JWTAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router, prefix="/api/v1")
app.include_router(threads_router, prefix="/api/v1")
app.include_router(clarify_draft_router, prefix="/api/v1")
app.include_router(pressure_test_router, prefix="/api/v1")
app.include_router(simulation_router, prefix="/api/v1")
app.include_router(decision_output_router, prefix="/api/v1")
app.include_router(failure_analysis_router, prefix="/api/v1")
app.include_router(export_router, prefix="/api/v1")
app.include_router(extraction_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1/admin")
app.include_router(user_router, prefix="/api/v1")
