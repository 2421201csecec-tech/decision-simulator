from fastapi import FastAPI

from app.api.routes.clarify_draft import router as clarify_draft_router
from app.api.routes.decision_output import router as decision_output_router
from app.api.routes.export import router as export_router
from app.api.routes.failure_analysis import router as failure_analysis_router
from app.api.routes.health import router as health_router
from app.api.routes.pressure_test import router as pressure_test_router
from app.api.routes.simulation import router as simulation_router
from app.api.routes.threads import router as threads_router
from app.config import settings
from app.logging_config import configure_logging

configure_logging(settings.log_level)

app = FastAPI(title=settings.app_name)
app.include_router(health_router, prefix="/api/v1")
app.include_router(threads_router, prefix="/api/v1")
app.include_router(clarify_draft_router, prefix="/api/v1")
app.include_router(pressure_test_router, prefix="/api/v1")
app.include_router(simulation_router, prefix="/api/v1")
app.include_router(decision_output_router, prefix="/api/v1")
app.include_router(failure_analysis_router, prefix="/api/v1")
app.include_router(export_router, prefix="/api/v1")
