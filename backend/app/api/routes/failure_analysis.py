from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StringConstraints, ValidationError

from app.storage.thread_store import get_failure_analysis, save_failure_analysis

router = APIRouter()

TextListItem = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
]


class FailureAnalysisPayload(BaseModel):
    whatHappened: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
    observations: list[TextListItem]
    failedAssumptions: list[TextListItem]
    rootCause: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


@router.get("/threads/{thread_id}/failure-analysis")
async def get_failure_analysis_route(thread_id: str) -> JSONResponse:
    failure_analysis = await get_failure_analysis(thread_id)
    if failure_analysis is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"failureAnalysis": failure_analysis})


@router.put("/threads/{thread_id}/failure-analysis")
async def put_failure_analysis(thread_id: str, request: Request) -> JSONResponse:
    raw_body = await request.body()
    if not raw_body:
        return JSONResponse({"message": "Invalid payload"}, status_code=400)

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"message": "Invalid payload"}, status_code=400)

    if not isinstance(payload, dict):
        return JSONResponse({"message": "Invalid payload"}, status_code=400)

    try:
        parsed = FailureAnalysisPayload.model_validate(payload)
    except ValidationError as error:
        first_error = error.errors()[0] if error.errors() else {}
        message = str(first_error.get("msg", "Invalid payload"))
        return JSONResponse({"message": message}, status_code=400)

    saved = await save_failure_analysis(
        thread_id,
        {
            "whatHappened": parsed.whatHappened,
            "observations": list(parsed.observations),
            "failedAssumptions": list(parsed.failedAssumptions),
            "rootCause": parsed.rootCause,
        },
    )

    if not saved:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    return JSONResponse({"failureAnalysis": saved})
