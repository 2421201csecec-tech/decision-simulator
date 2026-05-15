from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.storage.thread_store import cleanup_empty_threads

router = APIRouter()


@router.delete("/cleanup-threads")
async def cleanup_threads_route(older_than_hours: int = 24) -> JSONResponse:
    deleted = await cleanup_empty_threads(older_than_hours)
    return JSONResponse({"deleted": deleted, "older_than_hours": older_than_hours})
