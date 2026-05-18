from __future__ import annotations

import asyncio
import copy
import logging
from typing import Any
from uuid import uuid4

from app.config import settings
from app.extraction.consistency.checker import run_checks
from app.extraction.enrichment.enricher import Enricher
from app.extraction.memory.retriever import retrieve_similar
from app.extraction.memory.writer import should_store, write_extraction_to_memory
from app.extraction.passes.pass1_intent import run_pass1, PassParseError
from app.extraction.passes.pass2_variables import run_pass2
from app.extraction.passes.pass3_risks import run_pass3
from app.extraction.schemas import (
    ConfidenceSummary,
    ConsistencyReport,
    TelemetrySummary,
    ValidationSummary,
)
from app.extraction.validation.validator import SchemaValidator

logger = logging.getLogger("extraction.pipeline")


def compose_draft_input(draft: dict) -> str:
    """Compose clarify draft fields into a single user_input string for the extraction pipeline."""
    parts = [f"Decision: {(draft.get('title') or '').strip()}"]
    if draft.get("coreProblem"):
        parts.append(f"Problem: {draft['coreProblem']}")
    if draft.get("context"):
        parts.append(f"Context: {draft['context']}")
    if draft.get("constraints"):
        parts.append(f"Constraints: {'; '.join(draft['constraints'])}")
    if draft.get("assumptions"):
        parts.append(f"My assumptions: {'; '.join(draft['assumptions'])}")
    return "\n".join(parts)

# ---------------------------------------------------------------------------
# Clarification question templates — keyed by rule_id
# ---------------------------------------------------------------------------

_CLARIFICATION_TEMPLATES: dict[str, str] = {
    "V001": "What decision are you trying to make? Describe it in one sentence.",
    "V002": "What are the options you're choosing between? List at least 2 mutually exclusive choices.",
    "V003": "Each option needs a short name. Can you label your choices? (e.g. 'Hire now' vs 'Wait 6 months')",
    "V004": "What category does this decision fall into? Choose one: hiring, product, strategy, financial, ops, or other.",
    "V005": "Can you describe the key factors or variables that affect this decision? Aim for at least 3.",
    "V006": "For the variables you mentioned, what are the realistic minimum and maximum values?",
    "V007": "You referenced a variable dependency that doesn't exist in the schema. Can you re-describe how your variables relate to each other?",
    "V008": "How confident are you in each variable? Please rate from 0 (unknown) to 1 (certain).",
    "V010": "There's a circular dependency in your variables (A affects B affects A). Can you clarify the direction of influence?",
    "V012": "For your most important variables, should each be maximized, minimized, or is it neutral?",
    "V013": "Over what time period is this decision relevant? (e.g. '6 months', 'Q3 2025', 'next year')",
    "V015": "The variable map doesn't match your listed options. Can you re-confirm your action names?",
    "V016": "A constraint references a variable that isn't in your schema. Which variable does that constraint apply to?",
    "V017": "One of your boolean variables has a numeric range — boolean variables are true/false only. Can you clarify?",
    "V018": "Two of your hard constraints can't both be satisfied at the same time. Can you clarify which one takes priority?",
}

_FALLBACK_TEMPLATE = (
    "I need one clarification to continue: {message} Please provide it in one sentence."
)

# ---------------------------------------------------------------------------
# In-memory session state for 409 clarification resume
# ---------------------------------------------------------------------------

_sessions: dict[str, dict[str, Any]] = {}


class ExtractionError(Exception):
    pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clarification_question(hard_errors: list[dict]) -> str:
    if not hard_errors:
        return "Can you provide more detail about your decision?"
    first = hard_errors[0]
    rule_id = first.get("rule_id", "")
    if rule_id in _CLARIFICATION_TEMPLATES:
        return _CLARIFICATION_TEMPLATES[rule_id]
    return _FALLBACK_TEMPLATE.format(message=first.get("message", ""))


def _compute_confidence(schema: dict, constraint_conflicts: list[str]) -> ConfidenceSummary:
    variables = schema.get("variables", [])
    if not variables:
        zero = ConfidenceSummary(
            overall_confidence=0.0, evidence_strength=0.0, type_clarity=0.0,
            range_clarity=0.0, dependency_clarity=0.0, constraint_alignment=0.0,
        )
        return zero

    confidences = [float(v.get("extraction_confidence", 0.5)) for v in variables]
    evidence_strength = sum(confidences) / len(confidences)

    type_clarity = sum(1 for v in variables if v.get("type")) / len(variables)

    range_eligible = [v for v in variables if v.get("type") in ("continuous", "ordinal")]
    if range_eligible:
        range_clarity = sum(
            1 for v in range_eligible
            if v.get("range") and len(v["range"]) == 2 and v["range"][0] < v["range"][1]
        ) / len(range_eligible)
    else:
        range_clarity = 1.0

    dep_ok = sum(
        1 for v in variables
        if v.get("affects") or v.get("importance") in ("low", "medium")
    )
    dependency_clarity = dep_ok / len(variables)

    n_conflicts = len(constraint_conflicts)
    constraint_alignment = max(0.0, 1.0 - 0.2 * n_conflicts)

    overall = (
        0.35 * evidence_strength
        + 0.20 * type_clarity
        + 0.20 * range_clarity
        + 0.15 * dependency_clarity
        + 0.10 * constraint_alignment
    )

    return ConfidenceSummary(
        overall_confidence=round(min(1.0, overall), 4),
        evidence_strength=round(evidence_strength, 4),
        type_clarity=round(type_clarity, 4),
        range_clarity=round(range_clarity, 4),
        dependency_clarity=round(dependency_clarity, 4),
        constraint_alignment=round(constraint_alignment, 4),
    )


async def _run_pass_with_retry(
    pass_num: int,
    runner,
    validator: SchemaValidator,
    schema_ref: dict,
    *runner_args,
) -> dict:
    """Run a pass with up to max_retries_per_pass retries on HARD validation failures.

    Returns the updated schema_ref after merging the pass output.
    Raises ExtractionError (or returns clarification dict) on persistent failure.
    """
    error_context = ""
    max_attempts = settings.max_retries_per_pass + 1

    for attempt in range(max_attempts):
        output = await runner(*runner_args, error_context=error_context)

        # Merge pass output into running schema
        candidate = copy.deepcopy(schema_ref)
        if pass_num == 1:
            candidate.update(output)
        elif pass_num == 2:
            candidate["variables"] = output  # output is list[dict]
        elif pass_num == 3:
            candidate.update(output)

        vr = validator.validate(candidate)
        passes_to_rerun = validator.get_passes_to_rerun(vr)

        if pass_num not in passes_to_rerun:
            schema_ref.update(candidate)
            return schema_ref

        if attempt == max_attempts - 1:
            raise _PersistentFailure(vr.hard_errors)

        error_context = validator.get_error_context(vr)
        logger.info("pass %d attempt %d failed, retrying with error context", pass_num, attempt + 1)

    raise _PersistentFailure([])


class _PersistentFailure(Exception):
    def __init__(self, hard_errors: list[dict]):
        self.hard_errors = hard_errors


def _format_memory_context(schemas: list[dict]) -> str:
    if not schemas:
        return "No prior context available."
    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    lines = ["SIMILAR PAST DECISIONS (use for variable naming calibration only — do not copy):"]
    for i, s in enumerate(schemas, 1):
        top_vars = sorted(
            s.get("variables") or [],
            key=lambda v: rank.get(v.get("importance", "low"), 3),
        )[:4]
        top_risks = (s.get("risks") or [])[:2]
        lines.append(
            f"\n[{i}] Category: {s.get('decision_category')} | "
            f"Confidence: {s.get('confidence', {}).get('overall_confidence', 0):.2f}\n"
            f"Decision: {s.get('decision', '')}\n"
            f"Variables: {', '.join(v['name'] for v in top_vars if v.get('name'))}\n"
            f"Risks: {'; '.join(r['text'][:60] for r in top_risks if r.get('text'))}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_extraction(
    user_input: str,
    session_id: str | None = None,
    clarification_answer: str | None = None,
    user_id: str = "",
    decision_id: str | None = None,
    category_hint: str | None = None,
) -> dict:
    """Run the full extraction pipeline.

    Returns an ExtractionV1_1-shaped dict on success.
    Returns {"status": "clarification_needed", ...} if a pass persistently fails
    and CLARIFICATION_ENABLED=true.
    Raises ExtractionError on unrecoverable failure with clarification disabled.
    """
    from app.pattern_engine.capabilities import get_capabilities
    from app.pattern_engine.enrichment_layer import apply_pattern_enrichment
    from app.pattern_engine.importance_boost import apply_pattern_importance_boost
    from app.pattern_engine.injection_logger import log_injection
    from app.pattern_engine.pass3_injector import build_pass3_injection_block

    validator = SchemaValidator()
    enricher = Enricher()
    schema: dict[str, Any] = {}
    resume_from_pass: int | None = None

    # Load pattern capabilities (always — flags govern whether they actually fire)
    caps = await get_capabilities(user_id, category_hint or "")

    # Resume from saved session if provided
    if session_id and session_id in _sessions:
        session = _sessions.pop(session_id)
        schema = session["partial_schema"]
        resume_from_pass = session["failed_pass"]
        # Inject clarification answer as additional error context for the failed pass
        if clarification_answer:
            user_input = f"{session['original_input']}\n\nAdditional clarification: {clarification_answer}"
        else:
            user_input = session["original_input"]

    try:
        # Pass 1
        if resume_from_pass is None or resume_from_pass == 1:
            # Retrieve similar past decisions for few-shot context (category unknown pre-Pass 1)
            retrieved = await retrieve_similar(query_text=user_input, category_hint=None)
            memory_context = _format_memory_context(retrieved)
            if retrieved:
                logger.debug("retrieved %d similar schemas for memory context", len(retrieved))
            await _run_pass_with_retry(
                1, run_pass1, validator, schema,
                user_input, memory_context,  # positional args for run_pass1
            )

        # Pass 2
        if resume_from_pass is None or resume_from_pass <= 2:
            await _run_pass_with_retry(
                2, run_pass2, validator, schema,
                user_input, dict(schema),
            )
            # Hook A — Post-Pass-2: importance boost (no-op when flag is off)
            if caps["use_pattern_injection"]:
                schema["variables"] = apply_pattern_importance_boost(
                    schema.get("variables") or [],
                    caps["active_patterns"],
                    caps["blend_weight"],
                )

        # Re-scope capabilities now that Pass 1 has resolved decision_category
        resolved_category = schema.get("decision_category") or category_hint or ""
        if resolved_category != (category_hint or ""):
            caps = await get_capabilities(user_id, resolved_category)

        # Hook B — Pre-Pass-3: build pattern injection block (empty string when flag off)
        pattern_block = ""
        if caps["use_pattern_injection"]:
            pattern_block = build_pass3_injection_block(caps["active_patterns"])
            if pattern_block:
                logger.info("pass3_injection user=%s patterns=%d block_chars=%d", user_id, len(caps["active_patterns"]), len(pattern_block))

        # Pass 3
        await _run_pass_with_retry(
            3, run_pass3, validator, schema,
            user_input, dict(schema), pattern_block,
        )

    except _PersistentFailure as exc:
        failed_pass = _which_pass_failed(exc.hard_errors)
        if settings.clarification_enabled:
            sid = str(uuid4())
            _sessions[sid] = {
                "partial_schema": copy.deepcopy(schema),
                "failed_pass": failed_pass,
                "original_input": user_input,
            }
            return {
                "status": "clarification_needed",
                "clarification_question": _clarification_question(exc.hard_errors),
                "session_id": sid,
            }
        raise ExtractionError(
            f"Extraction failed after retries: {exc.hard_errors}"
        ) from exc

    # Hook C — Pre-Enrichment: pattern enrichment layer (no-op when flag off)
    if caps["use_pattern_injection"]:
        schema = await apply_pattern_enrichment(schema, caps["active_patterns"])

    # Standard enrichment (non-blocking — failure returns original schema)
    enrichment_ran = False
    if settings.enrichment_enabled:
        schema, _ = await enricher.enrich(schema, user_input)
        enrichment_ran = True

    # Consistency check
    consistency_report = run_checks(schema)

    # Confidence
    confidence = _compute_confidence(schema, consistency_report.constraint_conflicts)

    # Final validation pass (captures any enrichment-introduced issues as warnings)
    final_vr = validator.validate(schema)

    result = {
        **schema,
        "schema_version": "1.1.0",
        "confidence": confidence.model_dump(),
        "validation": ValidationSummary(
            hard_passed=final_vr.passed,
            rule_failures=final_vr.hard_errors,
            soft_fixes=final_vr.soft_fixes,
            retry_count=0,
        ).model_dump(),
        "consistency_report": consistency_report.model_dump(),
        "telemetry": TelemetrySummary(enrichment_applied=enrichment_ran).model_dump(),
    }

    # Fire-and-forget memory write — never blocks the response
    if should_store(result):
        asyncio.create_task(write_extraction_to_memory(result))

    # Fire-and-forget injection log — always written (even in shadow mode)
    if decision_id:
        asyncio.create_task(log_injection(
            decision_id=decision_id,
            user_id=user_id,
            caps=caps,
            lambda_adjusted=None,
            pass3_injected=bool(pattern_block),
            enrichment_gaps_added=len(result.get("pattern_flags") or []),
        ))

    return result


def _which_pass_failed(hard_errors: list[dict]) -> int:
    if not hard_errors:
        return 1
    passes = {e.get("re_run_pass", 1) for e in hard_errors}
    return min(passes)
