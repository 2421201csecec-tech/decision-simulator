from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

ThreadStatus = Literal["active", "revision", "failed", "completed"]

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / ".data"
DATA_FILE = DATA_DIR / "threads.json"

EMPTY_STORE: dict[str, list[dict[str, Any]]] = {"threads": []}

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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(EMPTY_STORE, indent=2), encoding="utf-8")


def _read_store() -> dict[str, list[dict[str, Any]]]:
    _ensure_store()
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return EMPTY_STORE


def _write_store(data: dict[str, list[dict[str, Any]]]) -> None:
    _ensure_store()
    DATA_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_grouped_threads() -> dict[str, list[dict[str, Any]]]:
    data = _read_store()
    grouped: dict[str, list[dict[str, Any]]] = {
        "active": [],
        "revisions": [],
        "failureAnalysis": [],
        "history": [],
    }

    for thread in data["threads"]:
        status = thread.get("status")
        if status == "active":
            grouped["active"].append(thread)
        elif status == "revision":
            grouped["revisions"].append(thread)
        elif status == "failed":
            grouped["failureAnalysis"].append(thread)
        else:
            grouped["history"].append(thread)

    return grouped


def create_thread(payload: dict[str, Any]) -> dict[str, Any]:
    data = _read_store()
    now = _now_iso()

    parent_thread_id = payload.get("parentThreadId")
    status = payload.get("status") or ("revision" if parent_thread_id else "active")
    title = (payload.get("title") or "").strip() or "Untitled Decision"

    thread = {
        "id": str(uuid4()),
        "title": title,
        "status": status,
        "parentThreadId": parent_thread_id,
        "createdAt": now,
        "updatedAt": now,
        "clarifyDraft": {
            "title": title,
            "coreProblem": "",
            "desiredOutcome": "",
            "context": "",
            "constraints": [],
            "assumptions": [],
        },
    }

    data["threads"].insert(0, thread)
    _write_store(data)
    return thread


def get_thread_by_id(thread_id: str) -> dict[str, Any] | None:
    data = _read_store()
    for thread in data["threads"]:
        if thread.get("id") == thread_id:
            return thread
    return None


def save_clarify_draft(thread_id: str, draft: dict[str, Any]) -> dict[str, Any] | None:
    data = _read_store()

    for idx, thread in enumerate(data["threads"]):
        if thread.get("id") != thread_id:
            continue

        was_failed = thread.get("status") == "failed"
        title = str(draft.get("title") or "").strip()

        updated_thread = {
            **thread,
            "status": "active" if was_failed else thread.get("status"),
            "title": title or thread.get("title"),
            "clarifyDraft": {
                "title": str(draft.get("title") or ""),
                "coreProblem": str(draft.get("coreProblem") or ""),
                "desiredOutcome": str(draft.get("desiredOutcome") or ""),
                "context": str(draft.get("context") or ""),
                "constraints": list(draft.get("constraints") or []),
                "assumptions": list(draft.get("assumptions") or []),
            },
            "updatedAt": _now_iso(),
        }

        # Clarify edits invalidate derived artifacts to force recomputation.
        updated_thread.pop("pressureTest", None)
        updated_thread.pop("simulationRuns", None)
        updated_thread.pop("failureAnalysis", None)

        data["threads"][idx] = updated_thread
        _write_store(data)
        return updated_thread

    return None


def _create_default_pressure_state() -> dict[str, Any]:
    scenarios = [
        {
            "id": scenario["id"],
            "scenario": scenario["scenario"],
            "question": scenario["question"],
            "thinkAbout": list(scenario["thinkAbout"]),
        }
        for scenario in DEFAULT_PRESSURE_SCENARIOS
    ]
    return {
        "scenarios": scenarios,
        "currentIndex": 0,
        "responses": {},
        "completed": False,
        "updatedAt": _now_iso(),
    }


def generate_pressure_test(thread_id: str) -> dict[str, Any] | None:
    data = _read_store()
    for idx, thread in enumerate(data["threads"]):
        if thread.get("id") != thread_id:
            continue

        if not thread.get("pressureTest"):
            updated_thread = {
                **thread,
                "pressureTest": _create_default_pressure_state(),
                "updatedAt": _now_iso(),
            }
            data["threads"][idx] = updated_thread
            _write_store(data)
            return updated_thread

        return thread

    return None


def get_pressure_test(thread_id: str) -> dict[str, Any] | None:
    thread = get_thread_by_id(thread_id)
    if not thread:
        return None
    return thread.get("pressureTest")


def _advance_pressure_scenario(
    thread_id: str,
    scenario_id: int,
    response_entry: dict[str, Any],
) -> dict[str, Any] | None:
    data = _read_store()
    for idx, thread in enumerate(data["threads"]):
        if thread.get("id") != thread_id:
            continue

        pressure_test = thread.get("pressureTest") or _create_default_pressure_state()
        current_index = int(pressure_test.get("currentIndex") or 0)
        scenarios = pressure_test.get("scenarios") or []
        current_scenario = scenarios[current_index] if current_index < len(scenarios) else None

        if not current_scenario or current_scenario.get("id") != scenario_id:
            return pressure_test

        responses = pressure_test.get("responses") or {}
        responses[str(scenario_id)] = response_entry
        pressure_test["responses"] = responses

        if current_index < len(scenarios) - 1:
            pressure_test["currentIndex"] = current_index + 1
        else:
            pressure_test["completed"] = True

        pressure_test["updatedAt"] = _now_iso()

        updated_thread = {
            **thread,
            "pressureTest": pressure_test,
            "updatedAt": _now_iso(),
        }
        data["threads"][idx] = updated_thread
        _write_store(data)
        return pressure_test

    return None


def submit_pressure_answer(thread_id: str, scenario_id: int, answer: str) -> dict[str, Any] | None:
    return _advance_pressure_scenario(
        thread_id,
        scenario_id,
        {"scenarioId": scenario_id, "answer": answer.strip(), "skipped": False, "answeredAt": _now_iso()},
    )


def skip_pressure_scenario(thread_id: str, scenario_id: int) -> dict[str, Any] | None:
    return _advance_pressure_scenario(
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


def run_simulation(thread_id: str, variables: dict[str, Any]) -> dict[str, Any] | None:
    data = _read_store()
    for idx, thread in enumerate(data["threads"]):
        if thread.get("id") != thread_id:
            continue

        run: dict[str, Any] = {
            "id": str(uuid4()),
            "variables": variables,
            "results": _estimate_simulation_result(variables),
            "createdAt": _now_iso(),
        }

        existing_runs: list[dict[str, Any]] = thread.get("simulationRuns") or []
        updated_thread = {
            **thread,
            "simulationRuns": [run, *existing_runs],
            "updatedAt": _now_iso(),
        }
        data["threads"][idx] = updated_thread
        _write_store(data)
        return run

    return None


def get_latest_simulation(thread_id: str) -> dict[str, Any] | None:
    thread = get_thread_by_id(thread_id)
    if not thread:
        return None
    runs: list[dict[str, Any]] = thread.get("simulationRuns") or []
    return runs[0] if runs else None


def get_simulation_history(thread_id: str) -> list[dict[str, Any]] | None:
    thread = get_thread_by_id(thread_id)
    if not thread:
        return None
    return thread.get("simulationRuns") or []


# ---------------------------------------------------------------------------
# Decision output (derived on-the-fly, not stored)
# ---------------------------------------------------------------------------

def get_decision_output_data(thread_id: str) -> dict[str, Any] | None:
    thread = get_thread_by_id(thread_id)
    if not thread:
        return None

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


def _create_default_failure_analysis(thread: dict[str, Any]) -> dict[str, Any]:
    assumptions = (thread.get("clarifyDraft") or {}).get("assumptions") or []
    return {
        "whatHappened": "",
        "observations": [
            "Market rejected pricing",
            "Competitor launched cheaper alternative",
            "Users did not see enough value",
        ],
        "failedAssumptions": assumptions[:2] if assumptions else [
            "Users would accept premium pricing",
            "Brand perceived as premium",
        ],
        "rootCause": "",
        "likelyRootCause": "Overestimated willingness to pay",
        "cognitiveBias": "Overconfidence bias detected",
        "missedVariable": "Competitor pricing dynamics",
        "recommendation": "Test pricing ladder: Rs 1499 / Rs 1999 / Rs 2499",
        "updatedAt": _now_iso(),
    }


def get_failure_analysis(thread_id: str) -> dict[str, Any] | None:
    data = _read_store()
    for idx, thread in enumerate(data["threads"]):
        if thread.get("id") != thread_id:
            continue
        if not thread.get("failureAnalysis"):
            default_fa = _create_default_failure_analysis(thread)
            data["threads"][idx] = {**thread, "failureAnalysis": default_fa, "updatedAt": _now_iso()}
            _write_store(data)
            return default_fa
        return thread["failureAnalysis"]
    return None


def get_thread_export_data(thread_id: str) -> dict[str, Any] | None:
    thread = get_thread_by_id(thread_id)
    if not thread:
        return None
    return _build_thread_export(thread)


def get_all_threads_export_data() -> list[dict[str, Any]]:
    data = _read_store()
    return [_build_thread_export(t) for t in data["threads"]]


def _build_thread_export(thread: dict[str, Any]) -> dict[str, Any]:
    return {
        "threadId": thread["id"],
        "sections": {
            "rawInput": thread.get("clarifyDraft"),
            "clarify": thread.get("clarifyDraft"),
            "pressureTest": thread.get("pressureTest"),
            "decisionOutput": get_decision_output_data(thread["id"]),
            "failureAnalysis": thread.get("failureAnalysis"),
        },
        "omittedSections": ["simulation"],
    }


def save_failure_analysis(thread_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    data = _read_store()
    for idx, thread in enumerate(data["threads"]):
        if thread.get("id") != thread_id:
            continue
        derived = _derive_failure_insights(
            payload.get("whatHappened", ""),
            payload.get("observations") or [],
            payload.get("failedAssumptions") or [],
            payload.get("rootCause", ""),
        )
        failure_analysis = {
            "whatHappened": payload.get("whatHappened", ""),
            "observations": payload.get("observations") or [],
            "failedAssumptions": payload.get("failedAssumptions") or [],
            "rootCause": payload.get("rootCause", ""),
            **derived,
            "updatedAt": _now_iso(),
        }
        data["threads"][idx] = {
            **thread,
            "status": "failed",
            "failureAnalysis": failure_analysis,
            "updatedAt": _now_iso(),
        }
        _write_store(data)
        return failure_analysis
    return None
