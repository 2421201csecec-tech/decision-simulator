from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StringConstraints, ValidationError

from app.extraction.pipeline import compose_draft_input, run_extraction
from app.storage.thread_store import get_thread_by_id, save_clarify_draft, save_extraction_schema

router = APIRouter()

TextListItem = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
]


class ClarifyDraftPayload(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=150)]
    coreProblem: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
    desiredOutcome: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]=""
    context: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
    constraints: list[TextListItem]
    assumptions: list[TextListItem]


@router.get("/threads/{thread_id}/clarify-draft")
async def get_clarify_draft(thread_id: str) -> JSONResponse:
    thread = await get_thread_by_id(thread_id)
    if not thread:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    return JSONResponse(
        {
            "threadId": thread.get("id"),
            "clarifyDraft": thread.get("clarifyDraft"),
        }
    )

@router.put("/threads/{thread_id}/clarify-draft")
async def put_clarify_draft(thread_id: str, request: Request) -> JSONResponse:
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
        parsed = ClarifyDraftPayload.model_validate(payload)
    except ValidationError as error:
        first_error = error.errors()[0] if error.errors() else {}
        message = str(first_error.get("msg", "Invalid payload"))
        return JSONResponse({"message": message}, status_code=400)

    saved = await save_clarify_draft(
        thread_id,
        {
            "title": parsed.title,
            "coreProblem": parsed.coreProblem,
            "desiredOutcome": parsed.desiredOutcome,
            "context": parsed.context,
            "constraints": parsed.constraints,
            "assumptions": parsed.assumptions,
        },
    )

    if not saved:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    return JSONResponse(
        {
            "threadId": saved.get("id"),
            "clarifyDraft": saved.get("clarifyDraft"),
        }
    )


@router.post("/threads/{thread_id}/extract")
async def post_extract(thread_id: str) -> JSONResponse:
    thread = await get_thread_by_id(thread_id)
    if not thread:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    clarify_draft = thread.get("clarifyDraft") or {}
    if not clarify_draft.get("title"):
        return JSONResponse({"message": "Clarify draft is empty"}, status_code=400)

    user_input = compose_draft_input(clarify_draft)
    result = await run_extraction(user_input)

    if result.get("status") == "clarification_needed":
        return JSONResponse({"message": "Clarification needed", "detail": result}, status_code=409)

    await save_extraction_schema(thread_id, result)
    return JSONResponse({"extractionSchema": result})
