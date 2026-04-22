from fastapi import FastAPI

from app.api.routes.clarify_draft import router as clarify_draft_router
from app.api.routes.health import router as health_router
from app.api.routes.threads import router as threads_router
from app.config import settings
from app.logging_config import configure_logging

configure_logging(settings.log_level)

app = FastAPI(title=settings.app_name)
app.include_router(health_router, prefix="/api/v1")
app.include_router(threads_router, prefix="/api/v1")
app.include_router(clarify_draft_router, prefix="/api/v1")
