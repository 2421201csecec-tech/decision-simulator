from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.simulation.aggregator import build_results
from app.simulation.explainer import generate_explanation
from app.simulation.monte_carlo import run_monte_carlo, run_sensitivity
from app.storage.thread_store import get_latest_simulation, get_simulation_history

router = APIRouter()


class SimulateRequest(BaseModel):
    extraction_schema: dict
    user_values: dict[str, float] = {}


class ScoreRequest(BaseModel):
    extraction_schema: dict
    simulation: dict


@router.post("/simulate")
async def post_simulate(req: SimulateRequest) -> JSONResponse:
    """Monte Carlo simulation. Returns distributions + sensitivity analysis. No LLM call."""
    action_map = run_monte_carlo(req.extraction_schema, req.user_values)
    if not action_map:
        return JSONResponse({"message": "Insufficient schema to simulate"}, status_code=422)

    actions = req.extraction_schema.get("actions") or []
    options, confidence = build_results(action_map, actions)

    baseline_scores = {opt["id"]: opt["score"] for opt in options}
    key_variable_id = run_sensitivity(req.extraction_schema, req.user_values, baseline_scores)

    return JSONResponse({
        "options": options,
        "confidence": confidence,
        "winner_id": options[0]["id"] if options else None,
        "key_variable_id": key_variable_id,
    })


@router.post("/score")
async def post_score(req: ScoreRequest) -> JSONResponse:
    """LLM explanation pass. Consumes /simulate output. options[] has all 9 metrics."""
    options = req.simulation.get("options") or []
    confidence = float(req.simulation.get("confidence") or 0.0)
    key_variable_id = req.simulation.get("key_variable_id")

    if not options:
        return JSONResponse({"message": "No simulation options to score"}, status_code=422)

    explanation = await generate_explanation(
        req.extraction_schema, options, confidence, key_variable_id
    )
    return JSONResponse({
        **req.simulation,
        "explanation": explanation,
    })


@router.get("/threads/{thread_id}/simulation")
async def get_simulation(thread_id: str) -> JSONResponse:
    run = await get_latest_simulation(thread_id)
    if run is None:
        return JSONResponse({"message": "Simulation run not found"}, status_code=404)
    return JSONResponse({"run": run})


@router.get("/threads/{thread_id}/simulation/history")
async def get_simulation_history_route(thread_id: str) -> JSONResponse:
    from app.storage.thread_store import get_simulation_history as _get_history
    runs = await _get_history(thread_id)
    if runs is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"runs": runs})
