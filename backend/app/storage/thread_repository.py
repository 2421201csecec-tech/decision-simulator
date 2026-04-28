from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import delete, select, update as sa_update
from sqlalchemy.orm import selectinload

import logging

from app.db.engine import get_async_session
from app.models.decision import Decision, FailureAnalysis, SimulationRun

logger = logging.getLogger("thread_repository")

ThreadStatus = Literal["active", "revision", "failed", "completed"]

DEFAULT_PRESSURE_SCENARIOS: list[dict[str, Any]] = [
    {
        "id": 1,
        "scenario": "A competitor launches a similar product at Rs 999.",
        "question": "How does your pricing decision hold in this case?",
        "thinkAbout": ["Value perception", "User expectations", "Long-term strategy"],
    },
    {
        "id": 2,
        "scenario": "Your target customers report the product is too expensive.",
        "question": "What adjustments would you consider to your pricing model?",
        "thinkAbout": ["Customer segments", "Price elasticity", "Feature bundling"],
    },
    {
        "id": 3,
        "scenario": "A major investor questions your pricing strategy in a pitch meeting.",
        "question": "How do you defend your pricing decision?",
        "thinkAbout": ["Unit economics", "Market positioning", "Growth potential"],
    },
    {
        "id": 4,
        "scenario": "Your CAC increases by 40% due to market changes.",
        "question": "Does your pricing still support sustainable growth?",
        "thinkAbout": ["LTV:CAC ratio", "Payback period", "Margin adjustment"],
    },
    {
        "id": 5,
        "scenario": "A key distribution partner asks for a 30% revenue share.",
        "question": "How does this affect your pricing viability?",
        "thinkAbout": ["Partnership value", "Margin protection", "Alternative channels"],
    },
    {
        "id": 6,
        "scenario": "Market research shows users would pay 2x more for premium features.",
        "question": "Should you pivot to a tiered pricing model?",
        "thinkAbout": ["Feature differentiation", "Conversion rates", "Revenue optimization"],
    },
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat().replace("+00:00", "Z")


def _format_dt(dt: datetime) -> str:
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.isoformat().replace("+00:00", "Z")


def _decision_to_dict(decision: Decision) -> dict[str, Any]:
    return {
        "id": decision.decision_id,
        "title": decision.title,
        "status": decision.status,
        "parentThreadId": decision.parent_decision_id,
        "createdAt": _format_dt(decision.created_at),
        "updatedAt": _format_dt(decision.updated_at),
        "clarifyDraft": decision.clarify_draft or {},
        "pressureTest": decision.pressure_test,
    }


def _decision_to_dict_full(decision: Decision) -> dict[str, Any]:
    d = _decision_to_dict(decision)
    runs = sorted(decision.simulation_runs, key=lambda r: r.created_at, reverse=True)
    d["simulationRuns"] = [
        {
            "id": r.id,
            "variables": r.variables,
            "results": r.results,
            "createdAt": _format_dt(r.created_at),
        }
        for r in runs
    ]
    fa = decision.failure_analysis
    if fa is not None:
        d["failureAnalysis"] = _fa_to_dict(fa)
    return d


def _fa_to_dict(fa: FailureAnalysis) -> dict[str, Any]:
    return {
        "whatHappened": fa.what_happened,
        "observations": fa.observations,
        "failedAssumptions": fa.failed_assumptions,
        "rootCause": fa.root_cause,
        "likelyRootCause": fa.likely_root_cause,
        "cognitiveBias": fa.cognitive_bias,
        "missedVariable": fa.missed_variable,
        "recommendation": fa.recommendation,
        "updatedAt": _format_dt(fa.updated_at),
    }


def _create_default_pressure_state() -> dict[str, Any]:
    scenarios = [
        {
            "id": s["id"],
            "scenario": s["scenario"],
            "question": s["question"],
            "thinkAbout": list(s["thinkAbout"]),
        }
        for s in DEFAULT_PRESSURE_SCENARIOS
    ]
    return {
        "scenarios": scenarios,
        "currentIndex": 0,
        "responses": {},
        "completed": False,
        "updatedAt": _now_iso(),
    }


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------

async def get_grouped_threads() -> dict[str, list[dict[str, Any]]]:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).order_by(Decision.created_at.desc())
        )
        decisions = result.scalars().all()
        grouped: dict[str, list[dict[str, Any]]] = {
            "active": [],
            "revisions": [],
            "failureAnalysis": [],
            "history": [],
        }
        for d in decisions:
            row = _decision_to_dict(d)
            status = row["status"]
            if status == "active":
                grouped["active"].append(row)
            elif status == "revision":
                grouped["revisions"].append(row)
            elif status == "failed":
                grouped["failureAnalysis"].append(row)
            else:
                grouped["history"].append(row)
        return grouped


async def create_thread(payload: dict[str, Any]) -> dict[str, Any]:
    now = _now()
    parent_thread_id = payload.get("parentThreadId")
    status = payload.get("status") or ("revision" if parent_thread_id else "active")
    title = (payload.get("title") or "").strip() or "Untitled Decision"

    decision = Decision(
        decision_id=str(uuid4()),
        title=title,
        status=status,
        parent_decision_id=parent_thread_id,
        created_at=now,
        updated_at=now,
        clarify_draft={
            "title": title,
            "coreProblem": "",
            "desiredOutcome": "",
            "context": "",
            "constraints": [],
            "assumptions": [],
        },
        pressure_test=None,
    )

    async with get_async_session() as session:
        session.add(decision)
        await session.commit()
        return _decision_to_dict(decision)


async def get_thread_by_id(thread_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision)
            .options(
                selectinload(Decision.simulation_runs),
                selectinload(Decision.failure_analysis),
            )
            .where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None
        return _decision_to_dict_full(decision)


# ---------------------------------------------------------------------------
# Clarify draft
# ---------------------------------------------------------------------------

async def save_clarify_draft(thread_id: str, draft: dict[str, Any]) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None

        was_failed = decision.status == "failed"
        title = str(draft.get("title") or "").strip()

        decision.status = "active" if was_failed else decision.status
        decision.title = title or decision.title
        decision.clarify_draft = {
            "title": str(draft.get("title") or ""),
            "coreProblem": str(draft.get("coreProblem") or ""),
            "desiredOutcome": str(draft.get("desiredOutcome") or ""),
            "context": str(draft.get("context") or ""),
            "constraints": list(draft.get("constraints") or []),
            "assumptions": list(draft.get("assumptions") or []),
        }
        decision.pressure_test = None
        decision.updated_at = _now()

        # Critical invariant: saving clarify draft wipes downstream artifacts.
        await session.execute(
            delete(SimulationRun).where(SimulationRun.decision_id == thread_id)
        )
        await session.execute(
            delete(FailureAnalysis).where(FailureAnalysis.decision_id == thread_id)
        )

        await session.commit()
        return _decision_to_dict(decision)


# ---------------------------------------------------------------------------
# Pressure test
# ---------------------------------------------------------------------------

async def generate_pressure_test(thread_id: str) -> dict[str, Any] | None:
    from app.extraction.pipeline import compose_draft_input, run_extraction
    from app.pressure_test.generator import generate_scenarios

    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None

        if decision.pressure_test is None:
            # TODO: write path on first access — remove when Engine 2 gets explicit trigger.
            extraction_schema = decision.extraction_schema

            # Step 1: run extraction if not already stored
            if not extraction_schema:
                clarify_draft = decision.clarify_draft or {}
                user_input = compose_draft_input(clarify_draft)
                if len(user_input.strip()) > 20:
                    try:
                        result_schema = await run_extraction(user_input)
                        if result_schema.get("status") != "clarification_needed":
                            extraction_schema = result_schema
                            decision.extraction_schema = extraction_schema
                    except Exception:
                        logger.warning("extraction failed for thread %s — using clarify draft fallback", thread_id, exc_info=True)

            # Step 2: generate scenarios from extraction schema or clarify draft
            source = extraction_schema or (decision.clarify_draft or {})
            ai_scenarios = await generate_scenarios(source)

            if ai_scenarios:
                for i, s in enumerate(ai_scenarios, start=1):
                    s["id"] = i
                state: dict[str, Any] = {
                    "scenarios": ai_scenarios,
                    "currentIndex": 0,
                    "responses": {},
                    "completed": False,
                    "updatedAt": _now_iso(),
                }
            else:
                state = _create_default_pressure_state()

            decision.pressure_test = state
            decision.updated_at = _now()
            await session.commit()

        return _decision_to_dict(decision)


async def get_pressure_test(thread_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision.pressure_test).where(Decision.decision_id == thread_id)
        )
        row = result.first()
        if row is None:
            return None
        return row[0]


async def _advance_pressure_scenario(
    thread_id: str,
    scenario_id: int,
    response_entry: dict[str, Any],
) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None

        pressure_test = decision.pressure_test or _create_default_pressure_state()
        current_index = int(pressure_test.get("currentIndex") or 0)
        scenarios = pressure_test.get("scenarios") or []
        current_scenario = scenarios[current_index] if current_index < len(scenarios) else None

        if not current_scenario or current_scenario.get("id") != scenario_id:
            return pressure_test

        responses = dict(pressure_test.get("responses") or {})
        responses[str(scenario_id)] = response_entry

        new_pressure_test = {
            **pressure_test,
            "responses": responses,
            "updatedAt": _now_iso(),
        }

        if current_index < len(scenarios) - 1:
            new_pressure_test["currentIndex"] = current_index + 1
        else:
            new_pressure_test["completed"] = True

        decision.pressure_test = new_pressure_test
        decision.updated_at = _now()
        await session.commit()

        return new_pressure_test


async def submit_pressure_answer(thread_id: str, scenario_id: int, answer: str) -> dict[str, Any] | None:
    return await _advance_pressure_scenario(
        thread_id,
        scenario_id,
        {"scenarioId": scenario_id, "answer": answer.strip(), "skipped": False, "answeredAt": _now_iso()},
    )


async def skip_pressure_scenario(thread_id: str, scenario_id: int) -> dict[str, Any] | None:
    return await _advance_pressure_scenario(
        thread_id,
        scenario_id,
        {"scenarioId": scenario_id, "answer": "", "skipped": True, "answeredAt": _now_iso()},
    )


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

def _parse_currency_value(input_str: str) -> int:
    numeric = re.sub(r"[^0-9]", "", input_str)
    try:
        return int(numeric)
    except ValueError:
        return 0


def _estimate_simulation_result(variables: dict[str, Any]) -> dict[str, Any]:
    price = _parse_currency_value(variables.get("price", ""))
    spend = _parse_currency_value(variables.get("marketingSpend", ""))
    target_market = variables.get("targetMarket", "")
    time_horizon = variables.get("timeHorizon", "")

    score = 50

    if target_market == "Early Adopters":
        score += 8
    elif target_market == "Mass Market":
        score += 3
    elif target_market == "Enterprise":
        score -= 2

    if price <= 1499:
        score += 8
    elif price <= 1999:
        score += 5
    elif price <= 2499:
        score += 1
    else:
        score -= 6

    if spend >= 100000:
        score += 8
    elif spend >= 50000:
        score += 4
    else:
        score -= 3

    if time_horizon == "6 Months":
        score += 4
    if time_horizon == "1 Month":
        score -= 2

    score = max(10, min(90, score))

    if score >= 70:
        adoption_projection = "High"
    elif score >= 55:
        adoption_projection = "Medium-High"
    elif score >= 40:
        adoption_projection = "Medium"
    else:
        adoption_projection = "Low"

    base_revenue_low = round((score * 4500) / 100) * 100
    base_revenue_high = base_revenue_low + round(base_revenue_low * 0.45)

    revenue_projection = (
        f"Rs {base_revenue_low / 100000:.1f}L - Rs {base_revenue_high / 100000:.1f}L"
        f" in first {time_horizon.lower()}"
    )
    competitor_reaction = (
        "Likely price undercut by smaller tools"
        if price <= 1999
        else "Moderate pushback from value-focused competitors"
    )
    user_perception = (
        "Premium but potentially expensive" if price >= 2499 else "Affordable but still premium"
    )

    low_adoption_risk = max(15, 70 - score)
    competitor_undercut_risk = 45 if price <= 1999 else 32
    pricing_adjustment_need = max(25, min(80, round((price / 2600) * 55)))

    insight = (
        "Lower pricing increases early adoption but weakens premium positioning."
        " Consider testing Rs 2199 as midpoint pricing."
        if price <= 1999
        else "Premium pricing protects brand perception but may slow early adoption."
        " Consider a limited-time entry offer."
    )

    return {
        "adoptionProjection": adoption_projection,
        "revenueProjection": revenue_projection,
        "competitorReaction": competitor_reaction,
        "userPerception": user_perception,
        "insight": insight,
        "risks": [
            {"label": "Low Adoption Risk", "percentage": low_adoption_risk},
            {"label": "Competitor Undercut", "percentage": competitor_undercut_risk},
            {"label": "Pricing Adjustment Need", "percentage": pricing_adjustment_need},
        ],
    }


async def run_simulation(thread_id: str, variables: dict[str, Any]) -> dict[str, Any] | None:
    async with get_async_session() as session:
        check = await session.execute(
            select(Decision.decision_id).where(Decision.decision_id == thread_id)
        )
        if check.scalar_one_or_none() is None:
            return None

        now = _now()
        run = SimulationRun(
            id=str(uuid4()),
            decision_id=thread_id,
            variables=variables,
            results=_estimate_simulation_result(variables),
            created_at=now,
        )
        session.add(run)
        await session.execute(
            sa_update(Decision)
            .where(Decision.decision_id == thread_id)
            .values(updated_at=now)
        )
        await session.commit()

        return {
            "id": run.id,
            "variables": run.variables,
            "results": run.results,
            "createdAt": _format_dt(now),
        }


async def get_latest_simulation(thread_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        check = await session.execute(
            select(Decision.decision_id).where(Decision.decision_id == thread_id)
        )
        if check.scalar_one_or_none() is None:
            return None

        result = await session.execute(
            select(SimulationRun)
            .where(SimulationRun.decision_id == thread_id)
            .order_by(SimulationRun.created_at.desc())
            .limit(1)
        )
        run = result.scalar_one_or_none()
        if run is None:
            return None
        return {
            "id": run.id,
            "variables": run.variables,
            "results": run.results,
            "createdAt": _format_dt(run.created_at),
        }


async def get_simulation_history(thread_id: str) -> list[dict[str, Any]] | None:
    async with get_async_session() as session:
        check = await session.execute(
            select(Decision.decision_id).where(Decision.decision_id == thread_id)
        )
        if check.scalar_one_or_none() is None:
            return None

        result = await session.execute(
            select(SimulationRun)
            .where(SimulationRun.decision_id == thread_id)
            .order_by(SimulationRun.created_at.desc())
        )
        runs = result.scalars().all()
        return [
            {
                "id": r.id,
                "variables": r.variables,
                "results": r.results,
                "createdAt": _format_dt(r.created_at),
            }
            for r in runs
        ]


# ---------------------------------------------------------------------------
# Decision output (derived on-the-fly)
# ---------------------------------------------------------------------------

def _compute_decision_output(thread: dict[str, Any]) -> dict[str, Any]:
    draft = thread.get("clarifyDraft") or {}
    simulation_runs = thread.get("simulationRuns") or []
    latest = simulation_runs[0] if simulation_runs else None
    pressure_test = thread.get("pressureTest") or {}
    pressure_responses = [
        r for r in (pressure_test.get("responses") or {}).values()
        if not r.get("skipped") and (r.get("answer") or "").strip()
    ]

    decision_title = (draft.get("title") or "").strip() or thread.get("title", "")

    if latest:
        v = latest.get("variables", {})
        final_decision = (
            f"Proceed with {v.get('price', '')} pricing for "
            f"{v.get('targetMarket', '')} over {v.get('timeHorizon', '').lower()}."
        )
    else:
        final_decision = "Run simulation to finalize decision direction."

    key_reasons: list[str] = []
    if draft.get("coreProblem"):
        key_reasons.append(f"Core objective: {draft['coreProblem']}")
    if pressure_responses:
        key_reasons.append("Pressure-test responses show scenario awareness and adaptability.")
    if latest:
        key_reasons.append(
            f"Simulation indicates {(latest.get('results') or {}).get('adoptionProjection', '').lower()} adoption potential."
        )
    if not key_reasons:
        key_reasons.append("Initial reasoning has been captured and is ready for validation.")

    key_risks: list[str] = []
    if latest:
        risks = (latest.get("results") or {}).get("risks") or []
        top_risk = sorted(risks, key=lambda r: r["percentage"], reverse=True)[0] if risks else None
        if top_risk:
            key_risks.append(f"{top_risk['label']} at {top_risk['percentage']}%.")
        key_risks.append((latest.get("results") or {}).get("competitorReaction", ""))
    else:
        key_risks.append("No simulation run yet; risk profile is incomplete.")

    assumptions = (draft.get("assumptions") or [])[:3]
    if not assumptions:
        assumptions = ["Assumptions are pending definition in Clarify stage."]

    if latest:
        risks = (latest.get("results") or {}).get("risks") or []
        avg_risk = sum(r["percentage"] for r in risks) / len(risks) if risks else 0
        base_strength = 100 - round(avg_risk)
    else:
        base_strength = 45
    pressure_bonus = min(20, len(pressure_responses) * 4)
    decision_strength = max(20, min(95, base_strength + pressure_bonus))

    strengths: list[str] = []
    if latest and "High" in ((latest.get("results") or {}).get("adoptionProjection") or ""):
        strengths.append("Projected adoption trend is favorable.")
    strengths.append("Decision path is grounded in structured stages.")
    if len(pressure_responses) >= 3:
        strengths.append("Multiple pressure scenarios were handled with explicit reasoning.")

    weak_points: list[str] = []
    if latest:
        for risk in ((latest.get("results") or {}).get("risks") or []):
            if risk["percentage"] >= 40:
                weak_points.append(f"{risk['label']} remains elevated ({risk['percentage']}%).")
    if not weak_points:
        weak_points.append("No major weak point flagged yet; continue validating assumptions.")

    suggested_experiment = (
        (latest.get("results") or {}).get("insight", "")
        if latest
        else "Run the simulation with at least two variable combinations to compare risk spread."
    )

    return {
        "decisionTitle": decision_title,
        "finalDecision": final_decision,
        "keyReasons": key_reasons,
        "keyRisks": key_risks,
        "assumptions": assumptions,
        "decisionStrength": decision_strength,
        "strengths": strengths,
        "weakPoints": weak_points,
        "suggestedExperiment": suggested_experiment,
    }


async def get_decision_output_data(thread_id: str) -> dict[str, Any] | None:
    from app.decision_output.generator import generate_decision_output

    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if not decision:
            return None

        # Return cached verdict if available
        if decision.decision_output:
            return decision.decision_output

        # Try LLM generation when extraction schema + completed pressure test exist
        extraction_schema = decision.extraction_schema
        pressure_test = decision.pressure_test
        if extraction_schema and pressure_test and pressure_test.get("completed"):
            output = await generate_decision_output(extraction_schema, pressure_test)
            if output:
                # Inject decisionTitle from thread for frontend compatibility
                output.setdefault("decisionTitle", (decision.clarify_draft or {}).get("title") or decision.title)
                decision.decision_output = output
                decision.updated_at = _now()
                await session.commit()
                return output

        # Fallback: algorithmic computation (existing behaviour)
        thread = _decision_to_dict_full(decision)
        return _compute_decision_output(thread)


# ---------------------------------------------------------------------------
# Failure analysis
# ---------------------------------------------------------------------------

def _derive_failure_insights(
    what_happened: str,
    observations: list[str],
    failed_assumptions: list[str],
    root_cause: str,
) -> dict[str, str]:
    signal = f"{what_happened} {root_cause} {' '.join(observations)} {' '.join(failed_assumptions)}".lower()

    if "price" in signal or "pricing" in signal:
        likely_root_cause = "Overestimated willingness to pay"
    elif "execution" in signal:
        likely_root_cause = "Execution mismatch between plan and rollout"
    else:
        likely_root_cause = "Mismatch between assumptions and real-world response"

    cognitive_bias = (
        "Overconfidence bias detected"
        if "assum" in signal or "confident" in signal
        else "Confirmation bias risk detected"
    )

    if "competitor" in signal:
        missed_variable = "Competitor pricing dynamics"
    elif "market" in signal:
        missed_variable = "Market demand volatility"
    else:
        missed_variable = "External environment shift"

    recommendation = (
        "Test pricing ladder: Rs 1499 / Rs 1999 / Rs 2499"
        if "price" in signal
        else "Run a controlled experiment with smaller rollout and explicit success criteria."
    )

    return {
        "likelyRootCause": likely_root_cause,
        "cognitiveBias": cognitive_bias,
        "missedVariable": missed_variable,
        "recommendation": recommendation,
    }


async def get_failure_analysis(thread_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        decision_result = await session.execute(
            select(Decision.decision_id, Decision.clarify_draft)
            .where(Decision.decision_id == thread_id)
        )
        row = decision_result.first()
        if row is None:
            return None

        fa_result = await session.execute(
            select(FailureAnalysis).where(FailureAnalysis.decision_id == thread_id)
        )
        fa = fa_result.scalar_one_or_none()

        # TODO: return default without persisting — GET should not write.
        #       Remove this block when Engine 5 introduces the real write path.
        if fa is None:
            clarify_draft = row[1] or {}
            assumptions = clarify_draft.get("assumptions") or []
            fa = FailureAnalysis(
                id=str(uuid4()),
                decision_id=thread_id,
                what_happened="",
                observations=[
                    "Market rejected pricing",
                    "Competitor launched cheaper alternative",
                    "Users did not see enough value",
                ],
                failed_assumptions=assumptions[:2] if assumptions else [
                    "Users would accept premium pricing",
                    "Brand perceived as premium",
                ],
                root_cause="",
                likely_root_cause="Overestimated willingness to pay",
                cognitive_bias="Overconfidence bias detected",
                missed_variable="Competitor pricing dynamics",
                recommendation="Test pricing ladder: Rs 1499 / Rs 1999 / Rs 2499",
                updated_at=_now(),
            )
            session.add(fa)
            await session.commit()

        return _fa_to_dict(fa)


async def save_failure_analysis(thread_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    async with get_async_session() as session:
        check = await session.execute(
            select(Decision.decision_id).where(Decision.decision_id == thread_id)
        )
        if check.scalar_one_or_none() is None:
            return None

        derived = _derive_failure_insights(
            payload.get("whatHappened", ""),
            payload.get("observations") or [],
            payload.get("failedAssumptions") or [],
            payload.get("rootCause", ""),
        )

        now = _now()

        fa_result = await session.execute(
            select(FailureAnalysis).where(FailureAnalysis.decision_id == thread_id)
        )
        fa = fa_result.scalar_one_or_none()

        if fa is None:
            fa = FailureAnalysis(
                id=str(uuid4()),
                decision_id=thread_id,
                what_happened=payload.get("whatHappened", ""),
                observations=payload.get("observations") or [],
                failed_assumptions=payload.get("failedAssumptions") or [],
                root_cause=payload.get("rootCause", ""),
                likely_root_cause=derived["likelyRootCause"],
                cognitive_bias=derived["cognitiveBias"],
                missed_variable=derived["missedVariable"],
                recommendation=derived["recommendation"],
                updated_at=now,
            )
            session.add(fa)
        else:
            fa.what_happened = payload.get("whatHappened", "")
            fa.observations = payload.get("observations") or []
            fa.failed_assumptions = payload.get("failedAssumptions") or []
            fa.root_cause = payload.get("rootCause", "")
            fa.likely_root_cause = derived["likelyRootCause"]
            fa.cognitive_bias = derived["cognitiveBias"]
            fa.missed_variable = derived["missedVariable"]
            fa.recommendation = derived["recommendation"]
            fa.updated_at = now

        await session.execute(
            sa_update(Decision)
            .where(Decision.decision_id == thread_id)
            .values(status="failed", updated_at=now)
        )
        await session.commit()

        return _fa_to_dict(fa)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def _build_thread_export(thread: dict[str, Any]) -> dict[str, Any]:
    return {
        "threadId": thread["id"],
        "sections": {
            "rawInput": thread.get("clarifyDraft"),
            "clarify": thread.get("clarifyDraft"),
            "pressureTest": thread.get("pressureTest"),
            "decisionOutput": _compute_decision_output(thread),
            "failureAnalysis": thread.get("failureAnalysis"),
        },
        "omittedSections": ["simulation"],
    }


async def get_thread_export_data(thread_id: str) -> dict[str, Any] | None:
    thread = await get_thread_by_id(thread_id)
    if not thread:
        return None
    return _build_thread_export(thread)


async def get_all_threads_export_data() -> list[dict[str, Any]]:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision)
            .options(
                selectinload(Decision.simulation_runs),
                selectinload(Decision.failure_analysis),
            )
            .order_by(Decision.created_at.desc())
        )
        decisions = result.scalars().all()
        return [_build_thread_export(_decision_to_dict_full(d)) for d in decisions]
