from __future__ import annotations

import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from app.storage.thread_store import get_all_threads_export_data, get_thread_export_data

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@router.get("/threads/export/all")
async def export_all_threads(request: Request) -> Response:
    threads = await get_all_threads_export_data(request.state.user_id)
    payload = {
        "version": "v1",
        "tier": "free",
        "exportedAt": _now_iso(),
        "threads": threads,
    }
    filename = f"threads-export-{date.today().isoformat()}.json"
    return Response(
        content=json.dumps(payload),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/threads/{thread_id}/export")
async def export_thread(thread_id: str, request: Request) -> Response:
    export_data = await get_thread_export_data(thread_id, request.state.user_id)
    if export_data is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    payload = {
        "version": "v1",
        "tier": "free",
        "exportedAt": _now_iso(),
        **export_data,
    }
    filename = f"thread-{thread_id}-export-{date.today().isoformat()}.json"
    return Response(
        content=json.dumps(payload),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
