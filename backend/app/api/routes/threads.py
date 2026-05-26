from __future__ import annotations

import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from app.storage.thread_store import (
    create_thread,
    get_grouped_threads,
    get_importable_threads,
    rebuild_thread,
    save_contingent_on_thread_id,
)

router = APIRouter()


class CreateThreadPayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    parentThreadId: UUID | None = None
    status: Literal["active", "revision", "failed", "completed"] | None = None


@router.get("/threads")
async def list_threads(request: Request, grouped: bool = Query(default=False)) -> JSONResponse:
    grouped_threads = await get_grouped_threads(request.state.user_id)
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

    thread = await create_thread(
        {
            "title": parsed.title,
            "parentThreadId": str(parsed.parentThreadId) if parsed.parentThreadId else None,
            "status": parsed.status,
        },
        user_id=request.state.user_id,
    )

    return JSONResponse(thread, status_code=201)


@router.get("/threads/importable")
async def list_importable_threads(request: Request) -> JSONResponse:
    threads = await get_importable_threads(request.state.user_id)
    return JSONResponse({"threads": threads})


class ContingentPayload(BaseModel):
    contingentOnThreadId: str


@router.put("/threads/{thread_id}/contingent")
async def put_contingent(thread_id: str, payload: ContingentPayload, request: Request) -> JSONResponse:
    updated = await save_contingent_on_thread_id(thread_id, payload.contingentOnThreadId, request.state.user_id)
    if not updated:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"ok": True})


class RebuildPayload(BaseModel):
    lessons: list[str] = Field(default_factory=list)


@router.post("/threads/{thread_id}/rebuild")
async def rebuild_thread_route(thread_id: str, payload: RebuildPayload, request: Request) -> JSONResponse:
    thread = await rebuild_thread(thread_id, request.state.user_id, payload.lessons)
    if thread is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse(thread, status_code=201)
