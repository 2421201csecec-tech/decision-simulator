from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

from app.storage.thread_store import get_latest_simulation, get_simulation_history, run_simulation

router = APIRouter()


class SimulationVariablesPayload(BaseModel):
    price: str
    targetMarket: Literal["Early Adopters", "Mass Market", "Enterprise"]
    marketingSpend: str
    timeHorizon: Literal["1 Month", "3 Months", "6 Months"]


@router.get("/threads/{thread_id}/simulation")
async def get_simulation(thread_id: str) -> JSONResponse:
    run = await get_latest_simulation(thread_id)
    if run is None:
        return JSONResponse({"message": "Simulation run not found"}, status_code=404)
    return JSONResponse({"run": run})


@router.post("/threads/{thread_id}/simulation")
async def post_simulation(thread_id: str, request: Request) -> JSONResponse:
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
        parsed = SimulationVariablesPayload.model_validate(payload)
    except ValidationError as error:
        first_error = error.errors()[0] if error.errors() else {}
        message = str(first_error.get("msg", "Invalid payload"))
        return JSONResponse({"message": message}, status_code=400)

    run = await run_simulation(
        thread_id,
        {
            "price": parsed.price,
            "targetMarket": parsed.targetMarket,
            "marketingSpend": parsed.marketingSpend,
            "timeHorizon": parsed.timeHorizon,
        },
    )

    if run is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    return JSONResponse({"run": run}, status_code=201)


@router.get("/threads/{thread_id}/simulation/history")
async def get_simulation_history_route(thread_id: str) -> JSONResponse:
    runs = await get_simulation_history(thread_id)
    if runs is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"runs": runs})
