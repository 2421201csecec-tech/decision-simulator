from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.storage.thread_store import get_decision_output_data

router = APIRouter()


@router.get("/threads/{thread_id}/decision-output")
async def get_decision_output(thread_id: str) -> JSONResponse:
    output = get_decision_output_data(thread_id)
    if output is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"output": output})
