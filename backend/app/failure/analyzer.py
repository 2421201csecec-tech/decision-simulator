from __future__ import annotations

import json
import logging
from pathlib import Path

from app.extraction.passes.llm_client import call_llm
from app.config import settings

logger = logging.getLogger("failure.analyzer")

_PROMPT_DIR = Path(__file__).parent / "prompts"


def _fill(template: str, **kwargs: str) -> str:
    result = template
    for key, value in kwargs.items():
        result = result.replace("{" + key + "}", value)
    return result


def _clean_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return raw


async def analyze_gaps(snapshot: dict, intake: dict) -> dict | None:
    """LLM call 1 — classify each assumption and derive root cause.

    Returns structured gap analysis dict or None on failure.
    Hallucination firewall: only returns assumption_gaps whose text appears
    in the snapshot assumptions list.
    Proceeds without assumption classification when snapshot has none.
    """
    assumptions = snapshot.get("assumptions") or []

    assumptions_block = (
        "\n".join(f"- {a}" for a in assumptions)
        if assumptions
        else "(No assumptions were recorded for this decision)"
    )

    template = (_PROMPT_DIR / "gap_analysis_v1.txt").read_text(encoding="utf-8")
    prompt = _fill(
        template,
        assumptions=assumptions_block,
        q1=intake.get("whatDid", "") or "",
        q2=intake.get("expectedOutcome", "") or "",
        q3=intake.get("whatHappened", "") or "",
        q4=intake.get("biggestSurprise", "") or "",
    )

    try:
        raw, _, _, _ = await call_llm(prompt, temperature=0.2, max_tokens=800, model=settings.llm_fallback_model)
        parsed = json.loads(_clean_fences(raw))
    except Exception:
        logger.warning("gap_analysis LLM call failed", exc_info=True)
        return None

    required = {"assumption_gaps", "failure_type", "likely_root_cause", "cognitive_bias", "missed_variable", "recommendation"}
    if not required.issubset(parsed.keys()):
        logger.warning("gap_analysis missing keys: %s", required - parsed.keys())
        return None

    # Hallucination firewall — drop gaps whose text isn't in snapshot assumptions.
    # When there are no assumptions, accept empty list (LLM should return []).
    
    
    if assumptions:
        assumption_set = {a.strip().lower() for a in assumptions}
        filtered_gaps = [
            g for g in (parsed.get("assumption_gaps") or [])
            if isinstance(g, dict)
            and g.get("text", "").strip().lower() in assumption_set
            and g.get("verdict") in ("held", "partial", "broke")
        ]
        parsed["assumption_gaps"] = filtered_gaps
    else:
        parsed["assumption_gaps"] = []

    valid_types = {"assumption", "execution", "external_shock", "framing"}
    if parsed.get("failure_type") not in valid_types:
        parsed["failure_type"] = "assumption"

    return parsed


async def extract_lessons(gap_analysis: dict, existing_patterns: list) -> list:
    """LLM call 2 — extract 1-3 lesson statements from the gap analysis.

    Returns list of lesson dicts or [] on any failure.
    """
    if not gap_analysis:
        return []

    template = (_PROMPT_DIR / "lesson_extraction_v1.txt").read_text(encoding="utf-8")
    prompt = _fill(
        template,
        gap_analysis_json=json.dumps(gap_analysis, indent=2),
        existing_patterns_json=json.dumps(existing_patterns, indent=2),
    )

    try:
        raw, _, _, _ = await call_llm(prompt, temperature=0.2, max_tokens=600, model=settings.llm_fallback_model)
        parsed = json.loads(_clean_fences(raw))
    except Exception:
        logger.warning("lesson_extraction LLM call failed", exc_info=True)
        return []

    lessons = parsed.get("lessons") or []
    valid = [
        l for l in lessons
        if isinstance(l, dict)
        and l.get("statement")
        and l.get("pattern_type")
        and isinstance(l.get("is_new"), bool)
    ]
    return valid[:3]
