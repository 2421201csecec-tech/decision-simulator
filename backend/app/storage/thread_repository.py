from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import delete, func, select, update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload

import logging

from app.db.engine import get_async_session
from app.models.decision import Decision, FailureAnalysis, PatternInstance, PatternProfile, SimulationRun

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
        "failureType": fa.failure_type,
        "assumptionGaps": fa.assumption_gaps,
        "lessons": fa.lessons,
        "snapshot": fa.snapshot,
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

async def get_grouped_threads(user_id: str) -> dict[str, list[dict[str, Any]]]:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.user_id == user_id).order_by(Decision.created_at.desc())
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


async def create_thread(payload: dict[str, Any], user_id: str) -> dict[str, Any]:
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
        user_id=user_id,
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


async def get_thread_context_data(thread_id: str) -> dict[str, Any] | None:
    """Lightweight 2-column fetch for context building — no joins, no relations loaded."""
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision.clarify_draft, Decision.pressure_test)
            .where(Decision.decision_id == thread_id)
        )
        row = result.first()
        if row is None:
            return None
        return {"clarifyDraft": row[0] or {}, "pressureTest": row[1] or {}}


async def get_thread_by_id(thread_id: str, user_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision)
            .options(
                selectinload(Decision.simulation_runs),
                selectinload(Decision.failure_analysis),
            )
            .where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None
        return _decision_to_dict_full(decision)


# ---------------------------------------------------------------------------
# Clarify draft
# ---------------------------------------------------------------------------

async def patch_clarify_draft_field(thread_id: str, user_id: str, key: str, value: Any) -> None:
    """Merge a single key into clarify_draft without wiping other fields."""
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(
                Decision.decision_id == thread_id,
                (Decision.user_id == user_id) | (Decision.user_id.is_(None)),
            )
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return
        draft = dict(decision.clarify_draft or {})
        draft[key] = value
        decision.clarify_draft = draft
        decision.updated_at = _now()
        await session.commit()


async def save_clarify_draft(thread_id: str, draft: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
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
# Pressure test — v2 helpers
# ---------------------------------------------------------------------------

def _build_v2_state(ai_roots: list[dict[str, Any]]) -> dict[str, Any]:
    """Construct a fresh v2 pressure_test state from pre-generated roots."""
    root_scenarios = [
        {
            "id": i + 1,
            "scenario_id": i + 1,
            "failure_vector": root["failure_vector"],
            "scenario": root["scenario"],
            "question": root["question"],
            "think_about": root.get("think_about", []),
            "priority": root.get("priority", i + 1),
            "probe_depth": root.get("probe_depth", 1),
            "probes": [],
            "status": "open",
            "commitment": None,
            "answer": None,
            "metadata": {
                "target_assumption_ids": [],
                "target_risk_ids": [],
                "sensitivity_vars": [],
            },
        }
        for i, root in enumerate(ai_roots)
    ]
    return {
        "rootScenarios": root_scenarios,
        "responses_summary": {
            "testedAssumptions": [],
            "unresolvedRisks": [],
            "commitmentQuality": "",
        },
        "enriched": False,
        "lastEnrichedAt": None,
        "completed": False,
        "synthesized": False,
        "summary": None,
        "updatedAt": _now_iso(),
    }


def _select_enrichment_targets(schema: dict) -> dict[str, dict[str, Any]]:
    """
    Deterministically assign schema elements to the three failure vectors.
    Returns {vector: {ids, labels}} used to patch root metadata.
    Enforces diversity: each vector gets a distinct top candidate.
    """
    # execution: highest-fragility assumption
    assumptions = sorted(
        (a for a in (schema.get("assumptions") or []) if isinstance(a, dict)),
        key=lambda a: float(a.get("fragility", 0)),
        reverse=True,
    )
    used_assumption_ids: set[str] = set()
    exec_ids: list[str] = []
    exec_vars: list[str] = []
    if assumptions:
        top = assumptions[0]
        aid = str(top.get("id") or top.get("text", "")[:30])
        exec_ids = [aid]
        used_assumption_ids.add(aid)

    # financial: highest-severity risk tagged financial, or highest-sensitivity variable
    risks = sorted(
        (r for r in (schema.get("risks") or []) if isinstance(r, dict)),
        key=lambda r: float(r.get("severity", 0)),
        reverse=True,
    )
    variables = schema.get("variables") or []
    fin_risk_ids: list[str] = []
    fin_vars: list[str] = []
    used_risk_ids: set[str] = set()
    for r in risks:
        rid = str(r.get("id") or r.get("text", "")[:30])
        if rid not in used_risk_ids:
            fin_risk_ids = [rid]
            used_risk_ids.add(rid)
            break
    if not fin_risk_ids and variables:
        fin_vars = [str(variables[0].get("id") or variables[0].get("name", ""))]

    # external: first hidden_dep, else first constraint from schema
    hidden_deps = schema.get("hidden_deps") or []
    ext_vars: list[str] = []
    if hidden_deps:
        dep = hidden_deps[0]
        ext_vars = [str(dep)[:80] if isinstance(dep, str) else str(dep.get("dependency") or dep.get("text", ""))[:80]]

    return {
        "execution": {"target_assumption_ids": exec_ids, "target_risk_ids": [], "sensitivity_vars": exec_vars},
        "financial": {"target_assumption_ids": [], "target_risk_ids": fin_risk_ids, "sensitivity_vars": fin_vars},
        "external": {"target_assumption_ids": [], "target_risk_ids": [], "sensitivity_vars": ext_vars},
    }


async def _run_extraction_and_enrich(thread_id: str, clarify_draft: dict) -> None:
    """
    Background task: run extraction and patch rootScenarios metadata.
    Patch-only — never overwrites existing answers or probes.
    """
    from app.extraction.pipeline import compose_draft_input, run_extraction

    user_input = compose_draft_input(clarify_draft)
    if len(user_input.strip()) <= 20:
        return

    try:
        schema = await run_extraction(user_input)
        if schema.get("status") == "clarification_needed":
            return

        targets = _select_enrichment_targets(schema)

        async with get_async_session() as session:
            result = await session.execute(
                select(Decision).where(Decision.decision_id == thread_id)
            )
            decision = result.scalar_one_or_none()
            if decision is None:
                return

            pt = dict(decision.pressure_test or {})
            if "rootScenarios" not in pt:
                # PT was regenerated as v1 in the meantime; just cache the schema
                if not decision.extraction_schema:
                    decision.extraction_schema = schema
                    decision.updated_at = _now()
                    await session.commit()
                return

            # Patch each root's metadata; preserve answers and probes
            root_scenarios = [dict(r) for r in pt["rootScenarios"]]
            for root in root_scenarios:
                vector = root.get("failure_vector", "")
                patch = targets.get(vector, {})
                if patch:
                    root["metadata"] = {
                        "target_assumption_ids": patch.get("target_assumption_ids", []),
                        "target_risk_ids": patch.get("target_risk_ids", []),
                        "sensitivity_vars": patch.get("sensitivity_vars", []),
                    }

            pt["rootScenarios"] = root_scenarios
            pt["enriched"] = True
            pt["lastEnrichedAt"] = _now_iso()
            pt["updatedAt"] = _now_iso()

            if not decision.extraction_schema:
                decision.extraction_schema = schema

            decision.pressure_test = pt
            decision.updated_at = _now()
            await session.commit()
            logger.info("enrichment completed for thread %s", thread_id)

    except Exception:
        logger.warning("_run_extraction_and_enrich failed for thread %s", thread_id, exc_info=True)


async def _synthesize_and_persist(thread_id: str) -> None:
    """Background task: run synthesis and store summary in pressure_test."""
    from app.pressure_test.synthesizer import synthesize_pressure_test

    try:
        async with get_async_session() as session:
            result = await session.execute(
                select(Decision).where(Decision.decision_id == thread_id)
            )
            decision = result.scalar_one_or_none()
            if decision is None:
                return

            pt = dict(decision.pressure_test or {})
            if "rootScenarios" not in pt or pt.get("synthesized"):
                return

            summary = await synthesize_pressure_test(pt, decision.extraction_schema)
            if summary:
                pt["summary"] = summary
                pt["synthesized"] = True
                pt["updatedAt"] = _now_iso()
                decision.pressure_test = pt
                decision.updated_at = _now()
                await session.commit()
                logger.info("synthesis completed for thread %s", thread_id)
    except Exception:
        logger.warning("_synthesize_and_persist failed for thread %s", thread_id, exc_info=True)


def _find_open_root(root_scenarios: list[dict]) -> dict | None:
    """Return the first root with status 'open' or 'probing'."""
    for root in root_scenarios:
        if root.get("status") in ("open", "probing"):
            return root
    return None


def _find_open_probe(root: dict) -> dict | None:
    """Return the first probe in a root with status 'open'."""
    for probe in (root.get("probes") or []):
        if probe.get("status") == "open":
            return probe
    return None


def _all_roots_closed(root_scenarios: list[dict]) -> bool:
    return all(r.get("status") == "closed" for r in root_scenarios)


# ---------------------------------------------------------------------------
# Pressure test — public API
# ---------------------------------------------------------------------------

async def generate_pressure_test(thread_id: str, user_id: str) -> dict[str, Any] | None:
    from app.pressure_test.generator import pre_generate_roots

    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None

        clarify_draft = decision.clarify_draft or {}

        if decision.pressure_test is None:
            weak_spots = await get_weak_spots(user_id)
            ai_roots = await pre_generate_roots(clarify_draft, weak_spots=weak_spots or None)
            state: dict[str, Any] = _build_v2_state(ai_roots) if ai_roots else _create_default_pressure_state()
            decision.pressure_test = state
            decision.updated_at = _now()
            await session.commit()

        # Always kick off extraction if schema is missing — regardless of whether
        # the pressure test was just created or already existed from pre-generation.
        if not decision.extraction_schema:
            asyncio.create_task(_run_extraction_and_enrich(thread_id, clarify_draft))

        return _decision_to_dict(decision)


async def get_pressure_test(thread_id: str, user_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision.pressure_test).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        row = result.first()
        if row is None:
            return None
        return row[0]


async def get_extraction_schema(thread_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision.extraction_schema).where(Decision.decision_id == thread_id)
        )
        row = result.first()
        if row is None:
            return None
        return row[0]


async def save_extraction_schema(thread_id: str, schema: dict) -> bool:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return False
        decision.extraction_schema = schema
        decision.updated_at = _now()
        await session.commit()
        return True


async def save_extraction_session(thread_id: str, data: dict) -> None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return
        decision.extraction_session = data
        decision.updated_at = _now()
        await session.commit()


async def load_and_clear_extraction_session(thread_id: str) -> dict | None:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None or not decision.extraction_session:
            return None
        data = dict(decision.extraction_session)
        decision.extraction_session = None
        await session.commit()
        return data


async def _advance_pressure_scenario(
    thread_id: str,
    scenario_id: int,
    response_entry: dict[str, Any],
) -> dict[str, Any] | None:
    """v1 sequential advance — unchanged, used only for v1-shape pressure tests."""
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


async def _submit_pressure_answer_v2(
    thread_id: str,
    root_id: int,
    answer: str,
    probe_id: str | None = None,
    user_id: str = "",
) -> dict[str, Any] | None:
    """v2 answer flow: evaluator-driven, conditional probe generation, root status transitions."""
    from app.pressure_test.evaluator import evaluate_answer
    from app.pressure_test.generator import generate_follow_up

    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None

        pt = dict(decision.pressure_test or {})
        root_scenarios: list[dict] = [dict(r) for r in (pt.get("rootScenarios") or [])]

        # Locate target root
        root = next((r for r in root_scenarios if r.get("id") == root_id), None)
        if root is None:
            return pt

        trimmed_answer = answer.strip()

        if probe_id:
            # Answering an existing probe
            probes = [dict(p) for p in (root.get("probes") or [])]
            probe = next((p for p in probes if p.get("id") == probe_id), None)
            if probe is None:
                return pt
            probe["answer"] = trimmed_answer
            probe["status"] = "answered"
            root["probes"] = probes

            # Evaluate the probe answer to decide whether to close the root
            eval_result = await evaluate_answer(
                probe.get("question", ""), trimmed_answer, root.get("failure_vector", "")
            )
            if eval_result.commitment:
                root["commitment"] = eval_result.commitment
            root["status"] = "closed"
        else:
            # Answering the root question
            root["answer"] = trimmed_answer

            eval_result = await evaluate_answer(
                root.get("question", ""), trimmed_answer, root.get("failure_vector", "")
            )
            if eval_result.commitment:
                root["commitment"] = eval_result.commitment

            current_probe_count = len(root.get("probes") or [])
            should_probe = (
                eval_result.next_probe_type is not None
                and current_probe_count < root.get("probe_depth", 1)
            )

            if should_probe:
                follow_up_q = await generate_follow_up(
                    root.get("question", ""),
                    trimmed_answer,
                    root.get("failure_vector", ""),
                    eval_result.next_probe_type,
                )
                if follow_up_q:
                    new_probe_id = f"{root_id}_{current_probe_count + 1}"
                    new_probe: dict[str, Any] = {
                        "id": new_probe_id,
                        "parentId": str(root_id),
                        "depth": current_probe_count + 1,
                        "question": follow_up_q,
                        "probeType": eval_result.next_probe_type,
                        "status": "open",
                        "answer": None,
                    }
                    root["probes"] = list(root.get("probes") or []) + [new_probe]
                    root["status"] = "probing"
                else:
                    root["status"] = "closed"
            else:
                root["status"] = "closed"

        # Write back the mutated root
        for i, r in enumerate(root_scenarios):
            if r.get("id") == root_id:
                root_scenarios[i] = root
                break

        pt["rootScenarios"] = root_scenarios
        pt["updatedAt"] = _now_iso()

        if _all_roots_closed(root_scenarios):
            pt["completed"] = True
            asyncio.create_task(_synthesize_and_persist(thread_id))

        decision.pressure_test = pt
        decision.updated_at = _now()
        await session.commit()

        # Classify the raw answer as a behavioral pattern (fire-and-forget)
        answer_text = probe["answer"] if probe_id else root.get("answer", "")
        if answer_text and answer_text.strip():
            asyncio.create_task(_classify_and_write_patterns(
                user_id=user_id,
                decision_id=thread_id,
                inputs=[{"index": 0, "field_type": "pt_answer", "text": answer_text[:500]}],
                source="pressure_test",
                decision_category=str(decision.decision_category or ""),
                clarify_draft=dict(decision.clarify_draft or {}),
                extraction_schema=dict(decision.extraction_schema or {}),
                pressure_test=pt,
            ))

        return pt


async def submit_pressure_answer(
    thread_id: str,
    scenario_id: int,
    answer: str,
    probe_id: str | None = None,
    user_id: str = "",
) -> dict[str, Any] | None:
    pt = await get_pressure_test(thread_id, user_id)
    if pt and "rootScenarios" in pt:
        return await _submit_pressure_answer_v2(thread_id, scenario_id, answer, probe_id, user_id)
    return await _advance_pressure_scenario(
        thread_id,
        scenario_id,
        {"scenarioId": scenario_id, "answer": answer.strip(), "skipped": False, "answeredAt": _now_iso()},
    )


async def skip_pressure_scenario(
    thread_id: str,
    scenario_id: int,
    probe_id: str | None = None,
    user_id: str = "",
) -> dict[str, Any] | None:
    pt = await get_pressure_test(thread_id, user_id)
    if pt and "rootScenarios" in pt:
        return await _skip_pressure_scenario_v2(thread_id, scenario_id, probe_id, user_id)
    return await _advance_pressure_scenario(
        thread_id,
        scenario_id,
        {"scenarioId": scenario_id, "answer": "", "skipped": True, "answeredAt": _now_iso()},
    )


async def _skip_pressure_scenario_v2(
    thread_id: str,
    root_id: int,
    probe_id: str | None = None,
    user_id: str = "",
) -> dict[str, Any] | None:
    """v2 skip: closes the current root (or probe) and moves to next open root."""
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        decision = result.scalar_one_or_none()
        if decision is None:
            return None

        pt = dict(decision.pressure_test or {})
        root_scenarios: list[dict] = [dict(r) for r in (pt.get("rootScenarios") or [])]

        root = next((r for r in root_scenarios if r.get("id") == root_id), None)
        if root is None:
            return pt

        if probe_id:
            probes = [dict(p) for p in (root.get("probes") or [])]
            for probe in probes:
                if probe.get("id") == probe_id:
                    probe["status"] = "skipped"
            root["probes"] = probes
            # Close root since user chose to skip the follow-up
            root["status"] = "closed"
        else:
            root["status"] = "closed"

        for i, r in enumerate(root_scenarios):
            if r.get("id") == root_id:
                root_scenarios[i] = root
                break

        pt["rootScenarios"] = root_scenarios
        pt["updatedAt"] = _now_iso()

        if _all_roots_closed(root_scenarios):
            pt["completed"] = True
            asyncio.create_task(_synthesize_and_persist(thread_id))

        decision.pressure_test = pt
        decision.updated_at = _now()
        await session.commit()

        return pt


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


async def get_latest_simulation(thread_id: str, user_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        check = await session.execute(
            select(Decision.decision_id).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
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
        results = run.results or {}
        if "options" in results:
            return {
                "id": run.id,
                "options": results.get("options"),
                "confidence": results.get("confidence"),
                "winner_id": results.get("winner_id"),
                "key_variable_id": results.get("key_variable_id"),
                "explanation": results.get("explanation"),
                "createdAt": _format_dt(run.created_at),
            }
        return {
            "id": run.id,
            "variables": run.variables,
            "results": results,
            "createdAt": _format_dt(run.created_at),
        }


async def save_v2_simulation(thread_id: str, payload: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        check = await session.execute(
            select(Decision.decision_id).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        if check.scalar_one_or_none() is None:
            return None
        now = _now()
        run = SimulationRun(
            id=str(uuid4()),
            decision_id=thread_id,
            variables={},
            results=payload,
            created_at=now,
        )
        session.add(run)
        await session.execute(
            sa_update(Decision).where(Decision.decision_id == thread_id).values(updated_at=now)
        )
        await session.commit()
        return {
            "id": run.id,
            "options": payload.get("options"),
            "confidence": payload.get("confidence"),
            "winner_id": payload.get("winner_id"),
            "key_variable_id": payload.get("key_variable_id"),
            "explanation": payload.get("explanation"),
            "createdAt": _format_dt(now),
        }


async def get_simulation_history(thread_id: str, user_id: str) -> list[dict[str, Any]] | None:
    async with get_async_session() as session:
        check = await session.execute(
            select(Decision.decision_id).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
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


async def get_decision_output_data(thread_id: str, user_id: str) -> dict[str, Any] | None:
    from app.decision_output.generator import generate_decision_output

    async with get_async_session() as session:
        result = await session.execute(
            select(Decision)
            .where(Decision.decision_id == thread_id, Decision.user_id == user_id)
            .options(selectinload(Decision.simulation_runs), selectinload(Decision.failure_analysis))
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
            from app.thread_context import build_thread_context
            ctx = build_thread_context({
                "clarifyDraft": decision.clarify_draft or {},
                "pressureTest": pressure_test,
                "extractionSchema": extraction_schema,
            })
            output = await generate_decision_output(extraction_schema, pressure_test, thread_context=ctx)
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

def _format_constraint(c: dict, var_map: dict) -> str:
    op_symbols = {">=": "≥", "<=": "≤", ">": ">", "<": "<", "==": "=", "!=": "≠"}
    target = c.get("target", "")
    var_name = var_map.get(target) or target.replace("var_", "").replace("_", " ").title()
    operator = op_symbols.get(c.get("operator", ""), c.get("operator", ""))
    value = c.get("value", "")
    unit = c.get("unit") or ""
    return f"{var_name} {operator} {value} {unit}".strip()


def _enrich_snapshot(clarify_draft: dict, extraction_schema: dict | None) -> dict:
    """Build snapshot from clarify_draft, overriding with LLM-extracted content where available."""
    snapshot = dict(clarify_draft or {})
    if not extraction_schema:
        return snapshot

    # Core problem → LLM-refined decision description
    if extraction_schema.get("decision"):
        snapshot["coreProblem"] = extraction_schema["decision"]

    # Assumptions → always use LLM-extracted (falsifiable, specific)
    schema_assumptions = extraction_schema.get("assumptions") or []
    if schema_assumptions:
        texts = [
            a.get("text") or a.get("statement") or ""
            for a in schema_assumptions
            if isinstance(a, dict)
        ]
        snapshot["assumptions"] = [t for t in texts if t]

    # Constraints → format structured extraction objects as readable strings
    schema_constraints = extraction_schema.get("constraints") or []
    if schema_constraints:
        var_map = {
            v.get("variable_id", ""): v.get("name", "")
            for v in (extraction_schema.get("variables") or [])
            if isinstance(v, dict)
        }
        formatted = [_format_constraint(c, var_map) for c in schema_constraints if isinstance(c, dict)]
        snapshot["constraints"] = [f for f in formatted if f]

    return snapshot


async def get_failure_analysis(thread_id: str, user_id: str) -> dict[str, Any] | None:
    async with get_async_session() as session:
        decision_result = await session.execute(
            select(Decision.decision_id, Decision.clarify_draft, Decision.extraction_schema)
            .where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        row = decision_result.first()
        if row is None:
            return None

        clarify_draft, extraction_schema = row[1], row[2]

        fa_result = await session.execute(
            select(FailureAnalysis).where(FailureAnalysis.decision_id == thread_id)
        )
        fa = fa_result.scalar_one_or_none()

        fresh_snapshot = _enrich_snapshot(clarify_draft or {}, extraction_schema)

        if fa is None:
            fa = FailureAnalysis(
                id=str(uuid4()),
                decision_id=thread_id,
                what_happened="",
                observations=[],
                failed_assumptions=[],
                root_cause="",
                likely_root_cause="",
                cognitive_bias="",
                missed_variable="",
                recommendation="",
                snapshot=fresh_snapshot,
                updated_at=_now(),
            )
            session.add(fa)
            try:
                await session.commit()
            except IntegrityError:
                # Concurrent request already inserted — roll back and fetch it
                await session.rollback()
                fa_result2 = await session.execute(
                    select(FailureAnalysis).where(FailureAnalysis.decision_id == thread_id)
                )
                fa = fa_result2.scalar_one_or_none()
                if fa is None:
                    return None
                fa.snapshot = fresh_snapshot
                await session.commit()
        else:
            # Always refresh snapshot from latest extraction schema
            fa.snapshot = fresh_snapshot
            await session.commit()

        return _fa_to_dict(fa)


async def save_failure_analysis(thread_id: str, payload: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    from app.failure.analyzer import analyze_gaps, extract_lessons

    async with get_async_session() as session:
        decision_result = await session.execute(
            select(Decision.decision_id, Decision.decision_category)
            .where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        row = decision_result.first()
        if row is None:
            return None
        decision_category = row[1] or ""

        fa_result = await session.execute(
            select(FailureAnalysis).where(FailureAnalysis.decision_id == thread_id)
        )
        fa = fa_result.scalar_one_or_none()
        snapshot = (fa.snapshot if fa is not None else None) or {}

        # LLM gap analysis — falls back gracefully on failure
        gap_result = await analyze_gaps(snapshot, payload)
        existing_patterns = await _get_pattern_list(user_id, session)
        lessons = await extract_lessons(gap_result or {}, existing_patterns)

        now = _now()

        if fa is None:
            fa = FailureAnalysis(
                id=str(uuid4()),
                decision_id=thread_id,
                what_happened=payload.get("whatHappened", ""),
                observations=payload.get("observations") or [],
                failed_assumptions=payload.get("failedAssumptions") or [],
                root_cause=payload.get("rootCause", ""),
                likely_root_cause=(gap_result or {}).get("likely_root_cause", ""),
                cognitive_bias=(gap_result or {}).get("cognitive_bias", ""),
                missed_variable=(gap_result or {}).get("missed_variable", ""),
                recommendation=(gap_result or {}).get("recommendation", ""),
                failure_type=(gap_result or {}).get("failure_type"),
                assumption_gaps=(gap_result or {}).get("assumption_gaps"),
                lessons=lessons or None,
                snapshot=snapshot,
                updated_at=now,
            )
            session.add(fa)
        else:
            fa.what_happened = payload.get("whatHappened", "")
            fa.observations = payload.get("observations") or []
            fa.failed_assumptions = payload.get("failedAssumptions") or []
            fa.root_cause = payload.get("rootCause", "")
            fa.likely_root_cause = (gap_result or {}).get("likely_root_cause", fa.likely_root_cause)
            fa.cognitive_bias = (gap_result or {}).get("cognitive_bias", fa.cognitive_bias)
            fa.missed_variable = (gap_result or {}).get("missed_variable", fa.missed_variable)
            fa.recommendation = (gap_result or {}).get("recommendation", fa.recommendation)
            fa.failure_type = (gap_result or {}).get("failure_type", fa.failure_type)
            fa.assumption_gaps = (gap_result or {}).get("assumption_gaps", fa.assumption_gaps)
            if lessons:
                fa.lessons = lessons
            fa.updated_at = now

        await session.execute(
            sa_update(Decision)
            .where(Decision.decision_id == thread_id)
            .values(status="failed", updated_at=now)
        )
        await session.commit()

        # Write lessons to pattern profile (fire-and-forget — does not block response)
        if lessons:
            asyncio.create_task(_write_lessons_to_pattern_profile(user_id, lessons, thread_id, decision_category))

        # Classify raw failure intake answers as behavioral patterns (fire-and-forget)
        intake_inputs = [
            {"index": i, "field_type": "failure_intake", "text": t}
            for i, t in enumerate([
                payload.get("whatHappened", ""),
                payload.get("expectedOutcome", ""),
                payload.get("whatDid", ""),
                payload.get("biggestSurprise", ""),
            ])
            if t and t.strip()
        ]
        if intake_inputs:
            asyncio.create_task(_classify_and_write_patterns(
                user_id=user_id,
                decision_id=thread_id,
                inputs=intake_inputs,
                source="failure_analysis",
                decision_category=decision_category,
                clarify_draft=snapshot,  # snapshot IS the clarify_draft (flat dict)
                extraction_schema={},
                pressure_test={},
            ))

        return _fa_to_dict(fa)


async def _get_pattern_list(user_id: str, session: Any) -> list[dict]:
    result = await session.execute(
        select(PatternProfile.patterns).where(PatternProfile.user_id == user_id)
    )
    row = result.first()
    return list(row[0] or []) if row else []


async def write_thinking_patterns(
    user_id: str,
    decision_id: str,
    patterns: list[dict],
    decision_category: str,
) -> None:
    """
    Write classified patterns: idempotent PatternInstance insert + locked theme upsert.
    All reads and writes share one DB transaction to prevent concurrent lost-updates.
    patterns: [{slug, statement, field_type, source, raw_text, evidence}]
    """
    if not patterns:
        return
    import hashlib
    from app.pattern_engine.confidence import compute_confidence, recency_days_from
    from app.pattern_engine.dedup import run_dedup
    from datetime import datetime, timezone as tz

    def _embed_sync(text: str) -> list[float]:
        try:
            from app.extraction.memory.embedder import _model
            if _model is None:
                return []
            vec = next(iter(_model.embed([text.strip()])), None)
            return vec.tolist() if vec is not None else []
        except Exception:
            return []

    now = datetime.now(tz.utc)

    try:
        async with get_async_session() as session:
            async with session.begin():
                # Lock the PatternProfile row early so all reads inside are consistent
                result = await session.execute(
                    select(PatternProfile)
                    .where(PatternProfile.user_id == user_id)
                    .with_for_update()
                )
                profile = result.scalar_one_or_none()
                now_iso = now.isoformat()

                if profile is None:
                    profile = PatternProfile(
                        user_id=user_id,
                        patterns=[],
                        themes=[],
                        blend_weight=0.0,
                        n_decisions=0,
                        n_outcomes=0,
                        updated_at=now,
                        created_at=now,
                        version=1,
                    )
                    session.add(profile)
                    await session.flush()  # persist so SELECT COUNT below sees row

                themes: list[dict] = list(profile.themes or [])

                for pat in patterns:
                    raw = pat.get("raw_text", "")[:500]
                    raw_hash = hashlib.sha256(raw.encode()).hexdigest()[:32]

                    # Idempotent insert: skip if same (user, decision, slug, hash) exists
                    stmt = (
                        pg_insert(PatternInstance)
                        .values(
                            user_id=user_id,
                            decision_id=decision_id,
                            slug=pat["slug"],
                            statement=pat["statement"],
                            field_type=pat.get("field_type", "unknown"),
                            source=pat.get("source", "unknown"),
                            raw_text=raw,
                            raw_text_hash=raw_hash,
                            created_at=now,
                        )
                        .on_conflict_do_nothing(constraint="uq_pattern_instance")
                    )
                    await session.execute(stmt)

                    # Count from DB (inside same transaction — sees just-inserted row)
                    count = await session.scalar(
                        select(func.count()).select_from(PatternInstance)
                        .where(
                            PatternInstance.user_id == user_id,
                            PatternInstance.slug == pat["slug"],
                        )
                    ) or 1

                    unique_decisions = await session.scalar(
                        select(func.count(PatternInstance.decision_id.distinct()))
                        .where(
                            PatternInstance.user_id == user_id,
                            PatternInstance.slug == pat["slug"],
                        )
                    ) or 1

                    # Dedup against current themes, then write back
                    emb = _embed_sync(pat["statement"])
                    diversity = min(1.0, unique_decisions / max(count, 1))
                    new_theme = {
                        "pattern_id": str(__import__("uuid").uuid4()),
                        "pattern_type": pat["slug"],
                        "statement": pat["statement"],
                        "failure_mode": pat["slug"],
                        "decision_category": decision_category,
                        "source": pat.get("source", "unknown"),
                        "field_type": pat.get("field_type", "unknown"),
                        "seen_in": [decision_id],
                        "count": count,
                        "first_seen": now_iso,
                        "last_seen": now_iso,
                        "confidence": compute_confidence(
                            recency_days=0,
                            consistency=diversity,
                            outcome_confirmation=None,
                            count=count,
                        ),
                        "embedding": emb if emb else None,
                    }
                    themes = run_dedup(themes, new_theme, decision_id)

                # Lazy embedding backfill: embed themes that missed embedding (model not ready at write time)
                try:
                    from app.extraction.memory.embedder import _model
                    from app.pattern_engine.confidence import compute_confidence as _cc, recency_days_from as _rd
                    if _model is not None:
                        for theme in themes:
                            if not theme.get("embedding"):
                                text = f"{theme.get('pattern_type', '')} {theme.get('statement', '')}"
                                vec = next(iter(_model.embed([text.strip()])), None)
                                if vec is not None:
                                    theme["embedding"] = vec.tolist()
                                    theme["confidence"] = _cc(
                                        recency_days=_rd(theme.get("last_seen")),
                                        consistency=theme.get("consistency"),
                                        outcome_confirmation=theme.get("outcome_confirmation"),
                                        count=int(theme.get("count", 1)),
                                    )
                except Exception:
                    logger.debug("write_thinking_patterns: lazy embedding backfill skipped", exc_info=False)

                profile.themes = themes
                profile.updated_at = now
        logger.info(
            "write_thinking_patterns ok user=%s decision=%s count=%d",
            user_id, decision_id, len(patterns),
        )
    except Exception:
        logger.warning("write_thinking_patterns failed", exc_info=True)


async def _write_lessons_to_pattern_profile(user_id: str, lessons: list[dict], decision_id: str, decision_category: str = "") -> None:
    try:
        from app.pattern_engine.confidence import compute_confidence, recency_days_from
        from app.pattern_engine.dedup import run_dedup

        async with get_async_session() as session:
            # SELECT FOR UPDATE — prevents concurrent lost updates (R5 safety)
            result = await session.execute(
                select(PatternProfile)
                .where(PatternProfile.user_id == user_id)
                .with_for_update()
            )
            profile = result.scalar_one_or_none()
            now = _now()
            now_iso = now.isoformat()

            if profile is None:
                profile = PatternProfile(
                    user_id=user_id,
                    patterns=[],
                    themes=[],
                    blend_weight=0.0,
                    n_decisions=0,
                    n_outcomes=1,  # failure analysis = one outcome observed
                    updated_at=now,
                    created_at=now,
                    version=1,
                )
                session.add(profile)
            else:
                profile.n_outcomes = (profile.n_outcomes or 0) + 1

            # --- Legacy flat patterns[] write (backward compat) ---
            patterns: list[dict] = list(profile.patterns or [])
            for lesson in lessons:
                ptype = lesson.get("pattern_type", "")
                existing = next((p for p in patterns if p.get("pattern_type") == ptype), None)
                if existing:
                    existing["count"] = existing.get("count", 1) + 1
                    seen = existing.get("seen_in") or []
                    if decision_id not in seen:
                        seen.append(decision_id)
                    existing["seen_in"] = seen
                    existing["last_seen"] = now_iso
                    existing["pattern"] = lesson.get("statement", existing.get("pattern", ""))
                else:
                    patterns.append({
                        "pattern": lesson.get("statement", ""),
                        "pattern_type": ptype,
                        "seen_in": [decision_id],
                        "count": 1,
                        "first_seen": now_iso,
                        "last_seen": now_iso,
                    })
            profile.patterns = patterns

            # --- New themes[] write with dedup + confidence ---
            themes: list[dict] = list(profile.themes or [])
            for lesson in lessons:
                new_theme = {
                    "pattern_id": lesson.get("pattern_id") or str(__import__("uuid").uuid4()),
                    "pattern_type": lesson.get("pattern_type", ""),
                    "statement": lesson.get("statement", ""),
                    "failure_mode": lesson.get("failure_type") or lesson.get("pattern_type", ""),
                    "decision_category": lesson.get("decision_category") or decision_category or None,
                    "seen_in": [decision_id],
                    "count": 1,
                    "first_seen": now_iso,
                    "last_seen": now_iso,
                    "confidence": compute_confidence(
                        recency_days=0,
                        consistency=None,
                        outcome_confirmation=None,
                        count=1,
                    ),
                    "consistency": None,
                    "outcome_confirmation": None,
                    "embedding": None,  # backfilled lazily in Phase 7 enrichment
                }
                themes = run_dedup(themes, new_theme, decision_id)

            # Lazy embedding backfill: embed themes that lack embeddings (if model available)
            try:
                from app.extraction.memory.embedder import _model
                from app.pattern_engine.confidence import compute_confidence as _cc, recency_days_from as _rd
                if _model is not None:
                    for theme in themes:
                        if not theme.get("embedding"):
                            text = f"{theme.get('pattern_type', '')} {theme.get('statement', '')}"
                            vec = next(iter(_model.embed([text.strip()])), None)
                            if vec is not None:
                                theme["embedding"] = vec.tolist()
                                # Recompute confidence now that we have embedding
                                theme["confidence"] = _cc(
                                    recency_days=_rd(theme.get("last_seen")),
                                    consistency=theme.get("consistency"),
                                    outcome_confirmation=theme.get("outcome_confirmation"),
                                    count=int(theme.get("count", 1)),
                                )
            except Exception:
                logger.debug("lazy embedding backfill failed — will retry next write", exc_info=False)

            profile.themes = themes
            profile.updated_at = now
            await session.commit()
    except Exception:
        logger.warning("write_lessons_to_pattern_profile failed", exc_info=True)


async def get_pattern_profile(user_id: str) -> dict[str, Any]:
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile).where(PatternProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()
        if profile is None:
            return {"patterns": []}
        return {"patterns": profile.patterns or []}


async def get_weak_spots(user_id: str) -> list[dict]:
    profile = await get_pattern_profile(user_id)
    return [p for p in profile.get("patterns", []) if p.get("count", 0) >= 2]


async def _classify_and_write_patterns(
    user_id: str,
    decision_id: str,
    inputs: list[dict],
    source: str,
    decision_category: str,
    clarify_draft: dict,
    extraction_schema: dict,
    pressure_test: dict,
) -> None:
    """Shared fire-and-forget helper: classify inputs → write patterns. Never raises."""
    try:
        from app.pattern_engine.classifier import classify_inputs_batch
        from app.pattern_engine.profile_service import get_active_patterns
        from app.thread_context import build_thread_context

        thread_ctx = build_thread_context({
            "clarifyDraft": clarify_draft,
            "extractionSchema": extraction_schema,
            "pressureTest": pressure_test,
        })
        existing_slugs = [
            t["pattern_type"] for t in
            await get_active_patterns(user_id, decision_category, min_conf=0.0)
        ]
        patterns = await classify_inputs_batch(
            inputs=inputs,
            source=source,
            thread_context=thread_ctx,
            existing_slugs=existing_slugs,
        )
        if patterns:
            for p in patterns:
                p["source"] = source
            await write_thinking_patterns(user_id, decision_id, patterns, decision_category)
    except Exception:
        logger.warning("_classify_and_write_patterns failed source=%s", source, exc_info=True)


async def rebuild_thread(thread_id: str, user_id: str, lessons: list[str]) -> dict[str, Any] | None:
    """
    Create a revision thread from a failed thread.
    Copies clarify_draft + extraction_schema, embeds lessons as _failure_context,
    pre-generates pressure test scenarios from empirical context. No LLM extraction needed.
    """
    from app.pressure_test.generator import pre_generate_roots

    async with get_async_session() as session:
        result = await session.execute(
            select(Decision).where(Decision.decision_id == thread_id, Decision.user_id == user_id)
        )
        source = result.scalar_one_or_none()
        if source is None:
            return None

        now = _now()
        source_draft = dict(source.clarify_draft or {})
        source_schema = dict(source.extraction_schema or {})

        # Strip any stale _failure_context from source before embedding new lessons
        source_draft.pop("_failure_context", None)
        enriched_draft = {**source_draft, "_failure_context": lessons}

        new_decision = Decision(
            decision_id=str(uuid4()),
            title=source_draft.get("title") or source.title or "Untitled Decision",
            status="revision",
            parent_decision_id=thread_id,
            created_at=now,
            updated_at=now,
            user_id=user_id,
            clarify_draft=enriched_draft,
            extraction_schema=source_schema,
            pressure_test=None,
        )
        session.add(new_decision)
        await session.commit()

        new_thread_id = new_decision.decision_id

    # Pre-generate pressure test outside the session to avoid holding the connection
    weak_spots = await get_weak_spots(user_id)
    ai_roots = await pre_generate_roots(enriched_draft, weak_spots=weak_spots or None)
    state: dict[str, Any] = _build_v2_state(ai_roots) if ai_roots else _create_default_pressure_state()

    async with get_async_session() as session:
        result = await session.execute(select(Decision).where(Decision.decision_id == new_thread_id))
        decision = result.scalar_one_or_none()
        if decision is None:
            return None
        decision.pressure_test = state
        decision.updated_at = _now()
        await session.commit()
        return _decision_to_dict(decision)


async def cleanup_empty_threads(older_than_hours: int = 24) -> int:
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
    async with get_async_session() as session:
        count_result = await session.execute(
            select(func.count()).select_from(Decision).where(
                Decision.title == "Untitled Decision",
                Decision.extraction_schema.is_(None),
                Decision.created_at < cutoff,
            )
        )
        deleted = count_result.scalar() or 0
        if deleted:
            await session.execute(
                delete(Decision).where(
                    Decision.title == "Untitled Decision",
                    Decision.extraction_schema.is_(None),
                    Decision.created_at < cutoff,
                )
            )
        await session.commit()
    return deleted


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


async def get_thread_export_data(thread_id: str, user_id: str) -> dict[str, Any] | None:
    thread = await get_thread_by_id(thread_id, user_id)
    if not thread:
        return None
    return _build_thread_export(thread)


async def get_all_threads_export_data(user_id: str) -> list[dict[str, Any]]:
    async with get_async_session() as session:
        result = await session.execute(
            select(Decision)
            .where(Decision.user_id == user_id)
            .options(
                selectinload(Decision.simulation_runs),
                selectinload(Decision.failure_analysis),
            )
            .order_by(Decision.created_at.desc())
        )
        decisions = result.scalars().all()
        return [_build_thread_export(_decision_to_dict_full(d)) for d in decisions]
