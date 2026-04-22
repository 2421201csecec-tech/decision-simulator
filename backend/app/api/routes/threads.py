from __future__ import annotations

import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from app.storage.thread_store import create_thread, get_grouped_threads

router = APIRouter()


class CreateThreadPayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    parentThreadId: UUID | None = None
    status: Literal["active", "revision", "failed", "completed"] | None = None


@router.get("/threads")
async def list_threads(grouped: bool = Query(default=False)) -> JSONResponse:
    grouped_threads = get_grouped_threads()
    if grouped:
        return JSONResponse(grouped_threads)

    flattened = (
        grouped_threads["active"]
        + grouped_threads["revisions"]
        + grouped_threads["failureAnalysis"]
        + grouped_threads["history"]
    )
    return JSONResponse({"threads": flattened})


@router.post("/threads")
async def create_threads(request: Request) -> JSONResponse:
    raw_body = await request.body()
    if not raw_body:
        payload = {}
    else:
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JSONResponse({"message": "Invalid payload"}, status_code=400)

    if not isinstance(payload, dict):
        return JSONResponse({"message": "Invalid payload"}, status_code=400)

    try:
        parsed = CreateThreadPayload.model_validate(payload)
    except ValidationError as error:
        first_error = error.errors()[0] if error.errors() else {}
        message = str(first_error.get("msg", "Invalid payload"))
        return JSONResponse({"message": message}, status_code=400)

    thread = create_thread(
        {
            "title": parsed.title,
            "parentThreadId": str(parsed.parentThreadId) if parsed.parentThreadId else None,
            "status": parsed.status,
        }
    )

    return JSONResponse(thread, status_code=201)
