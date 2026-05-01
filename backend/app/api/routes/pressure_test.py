from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints, ValidationError

from app.storage.thread_store import (
    generate_pressure_test,
    get_pressure_test,
    skip_pressure_scenario,
    submit_pressure_answer,
)

router = APIRouter()


class PreGenerateRequest(BaseModel):
    thread_id: str


@router.post("/pressure-test/pre-generate")
async def post_pre_generate(req: PreGenerateRequest) -> JSONResponse:
    """Pre-generate v2 root scenarios instantly from clarify draft (< 5s)."""
    thread = await generate_pressure_test(req.thread_id)
    if not thread:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"pressureTest": thread.get("pressureTest")})


class PressureAnswerPayload(BaseModel):
    scenarioId: int = Field(gt=0)
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    probeId: str | None = None


class PressureSkipPayload(BaseModel):
    scenarioId: int = Field(gt=0)
    probeId: str | None = None


@router.get("/threads/{thread_id}/pressure-test")
async def get_pressure(thread_id: str) -> JSONResponse:
    pressure_test = await get_pressure_test(thread_id)
    if not pressure_test:
        return JSONResponse({"message": "Pressure test not found"}, status_code=404)
    return JSONResponse({"pressureTest": pressure_test})


@router.post("/threads/{thread_id}/pressure-test")
async def post_pressure(thread_id: str) -> JSONResponse:
    thread = await generate_pressure_test(thread_id)
    if not thread:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"pressureTest": thread.get("pressureTest")})


@router.post("/threads/{thread_id}/pressure-test/answer")
async def post_pressure_answer(thread_id: str, request: Request) -> JSONResponse:
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None

    try:
        parsed = PressureAnswerPayload.model_validate(payload)
    except ValidationError as error:
        first_error = error.errors()[0] if error.errors() else {}
        message = str(first_error.get("msg", "Invalid payload"))
        return JSONResponse({"message": message}, status_code=400)

    existing = await get_pressure_test(thread_id)
    if not existing:
        return JSONResponse({"message": "Pressure test not found"}, status_code=404)

    # v2 path: no sequential-index validation — any open root ID is valid
    if "rootScenarios" in existing:
        root_scenarios = existing.get("rootScenarios") or []
        target_root = next((r for r in root_scenarios if r.get("id") == parsed.scenarioId), None)
        if not target_root:
            return JSONResponse({"message": "Root scenario not found"}, status_code=404)
        if target_root.get("status") == "closed":
            return JSONResponse({"message": "This scenario is already closed"}, status_code=409)
        if existing.get("completed"):
            return JSONResponse({"message": "Pressure test is already completed"}, status_code=409)
    else:
        # v1 sequential validation
        current_index = int(existing.get("currentIndex") or 0)
        scenarios = existing.get("scenarios") or []
        current_scenario = scenarios[current_index] if current_index < len(scenarios) else None
        if not current_scenario:
            return JSONResponse({"message": "Pressure test is already completed"}, status_code=409)
        if current_scenario.get("id") != parsed.scenarioId:
            return JSONResponse({"message": "Scenario does not match current pressure-test step"}, status_code=409)

    pressure_test = await submit_pressure_answer(
        thread_id, parsed.scenarioId, parsed.answer, probe_id=parsed.probeId
    )
    if not pressure_test:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    return JSONResponse({"pressureTest": pressure_test})


@router.post("/threads/{thread_id}/pressure-test/skip")
async def post_pressure_skip(thread_id: str, request: Request) -> JSONResponse:
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None

    try:
        parsed = PressureSkipPayload.model_validate(payload)
    except ValidationError as error:
        first_error = error.errors()[0] if error.errors() else {}
        message = str(first_error.get("msg", "Invalid payload"))
        return JSONResponse({"message": message}, status_code=400)

    existing = await get_pressure_test(thread_id)
    if not existing:
        return JSONResponse({"message": "Pressure test not found"}, status_code=404)

    if "rootScenarios" in existing:
        root_scenarios = existing.get("rootScenarios") or []
        target_root = next((r for r in root_scenarios if r.get("id") == parsed.scenarioId), None)
        if not target_root:
            return JSONResponse({"message": "Root scenario not found"}, status_code=404)
        if existing.get("completed"):
            return JSONResponse({"message": "Pressure test is already completed"}, status_code=409)
    else:
        current_index = int(existing.get("currentIndex") or 0)
        scenarios = existing.get("scenarios") or []
        current_scenario = scenarios[current_index] if current_index < len(scenarios) else None
        if not current_scenario:
            return JSONResponse({"message": "Pressure test is already completed"}, status_code=409)
        if current_scenario.get("id") != parsed.scenarioId:
            return JSONResponse({"message": "Scenario does not match current pressure-test step"}, status_code=409)

    pressure_test = await skip_pressure_scenario(
        thread_id, parsed.scenarioId, probe_id=parsed.probeId
    )
    if not pressure_test:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    return JSONResponse({"pressureTest": pressure_test})
