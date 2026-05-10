from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from sqlalchemy import text

from app.api.routes.clarify_draft import router as clarify_draft_router
from app.extraction.api import router as extraction_router
from app.api.routes.decision_output import router as decision_output_router
from app.api.routes.export import router as export_router
from app.api.routes.failure_analysis import router as failure_analysis_router
from app.api.routes.health import router as health_router
from app.api.routes.pressure_test import router as pressure_test_router
from app.api.routes.simulation import router as simulation_router
from app.api.routes.threads import router as threads_router
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
    yield
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
    await engine.dispose()

# Initialize FastAPI app and include all routers

app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(health_router, prefix="/api/v1")
app.include_router(threads_router, prefix="/api/v1")
app.include_router(clarify_draft_router, prefix="/api/v1")
app.include_router(pressure_test_router, prefix="/api/v1")
app.include_router(simulation_router, prefix="/api/v1")
app.include_router(decision_output_router, prefix="/api/v1")
app.include_router(failure_analysis_router, prefix="/api/v1")
app.include_router(export_router, prefix="/api/v1")
app.include_router(extraction_router, prefix="/api/v1")
