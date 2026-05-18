from __future__ import annotations

import json
from typing import Annotated, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StringConstraints, ValidationError

from app.storage.thread_store import get_failure_analysis, get_pattern_profile, save_failure_analysis

router = APIRouter()

TextListItem = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
]


class FailureAnalysisPayload(BaseModel):
    whatHappened: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
    expectedOutcome: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    whatDid: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    biggestSurprise: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    observations: list[TextListItem] = []
    failedAssumptions: list[TextListItem] = []
    rootCause: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


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
            "expectedOutcome": parsed.expectedOutcome,
            "whatDid": parsed.whatDid,
            "biggestSurprise": parsed.biggestSurprise,
            "observations": list(parsed.observations),
            "failedAssumptions": list(parsed.failedAssumptions),
            "rootCause": parsed.rootCause,
        },
        user_id=request.state.user_id,
    )

    if not saved:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    return JSONResponse({"failureAnalysis": saved})


@router.get("/threads/{thread_id}/pattern-profile")
async def get_pattern_profile_route(thread_id: str, request: Request) -> JSONResponse:
    profile = await get_pattern_profile(request.state.user_id)
    return JSONResponse(profile)
