from __future__ import annotations

from fastapi import APIRouter, Request
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
    thread_id: str | None = None


class ScoreRequest(BaseModel):
    extraction_schema: dict
    simulation: dict
    user_values: dict[str, float] = {}
    thread_id: str | None = None


@router.post("/simulate")
async def post_simulate(req: SimulateRequest, request: Request) -> JSONResponse:
    """Monte Carlo simulation. Returns distributions + sensitivity analysis. No LLM call."""
    from app.pattern_engine.capabilities import get_capabilities
    from app.pattern_engine.lambda_adjuster import compute_adjusted_lambdas

    action_map = run_monte_carlo(req.extraction_schema, req.user_values)
    if not action_map:
        return JSONResponse({"message": "Insufficient schema to simulate"}, status_code=422)

    category = req.extraction_schema.get("decision_category") or ""
    caps = await get_capabilities(request.state.user_id, category)

    lambda_base = {"lambda1": 0.30, "lambda2": 0.40, "lambda3": 0.10, "lambda4": 0.20}
    lambda_adjusted = None
    pattern_note = None

    if caps["use_failure_biasing"]:
        lambda_adjusted = compute_adjusted_lambdas(
            caps["active_patterns"], caps["blend_weight"], category
        )
        if lambda_adjusted != lambda_base:
            pattern_note = (
                "Score adjusted based on your past failure patterns. "
                f"Risk weights: L1={lambda_adjusted['lambda1']:.2f}, "
                f"L2={lambda_adjusted['lambda2']:.2f}."
            )

    actions = req.extraction_schema.get("actions") or []
    options, confidence = build_results(action_map, actions, lambdas=lambda_adjusted)
    base_options, _ = build_results(action_map, actions, lambdas=None)

    baseline_scores = {opt["id"]: opt["score"] for opt in options}
    key_variable_id = run_sensitivity(req.extraction_schema, req.user_values, baseline_scores)

    winner = options[0] if options else None
    base_winner = base_options[0] if base_options else None

    return JSONResponse({
        "options": options,
        "confidence": confidence,
        "winner_id": winner["id"] if winner else None,
        "key_variable_id": key_variable_id,
        "base_score": round(base_winner["score"], 4) if base_winner else None,
        "adjusted_score": round(winner["score"], 4) if winner and lambda_adjusted else None,
        "lambda_adjusted": lambda_adjusted,
        "pattern_note": pattern_note,
    })


@router.post("/score")
async def post_score(req: ScoreRequest) -> JSONResponse:
    """LLM explanation pass. Consumes /simulate output. options[] has all 9 metrics."""
    options = req.simulation.get("options") or []
    confidence = float(req.simulation.get("confidence") or 0.0)
    key_variable_id = req.simulation.get("key_variable_id")

    if not options:
        return JSONResponse({"message": "No simulation options to score"}, status_code=422)

    thread_context = ""
    if req.thread_id:
        from app.storage.thread_store import get_thread_context_data
        from app.thread_context import build_thread_context
        ctx_data = await get_thread_context_data(req.thread_id)
        if ctx_data:
            thread_context = build_thread_context({
                **ctx_data,
                "extractionSchema": req.extraction_schema,
            })

    explanation = await generate_explanation(
        req.extraction_schema, options, confidence, key_variable_id,
        user_values=req.user_values,
        thread_context=thread_context,
    )
    return JSONResponse({
        **req.simulation,
        "explanation": explanation,
    })
# The following endpoints fetch past simulation runs for a thread.
# The frontend currently only uses the latest run endpoint, but the history endpoint 
# is available for debugging and potential future features.

@router.get("/threads/{thread_id}/simulation")
async def get_simulation(thread_id: str) -> JSONResponse:
    from app.storage.thread_store import get_extraction_schema
    run = await get_latest_simulation(thread_id)
    extraction_schema = await get_extraction_schema(thread_id)
    if run is None and extraction_schema is None:
        return JSONResponse({"message": "Simulation run not found"}, status_code=404)
    return JSONResponse({"run": run, "extractionSchema": extraction_schema})

#this endpoint is not currently used by the frontend but is available for debugging and future features like showing past runs

@router.get("/threads/{thread_id}/simulation/history")
async def get_simulation_history_route(thread_id: str) -> JSONResponse:
    from app.storage.thread_store import get_simulation_history as _get_history
    runs = await _get_history(thread_id)
    if runs is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"runs": runs})
