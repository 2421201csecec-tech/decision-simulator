from __future__ import annotations

import json
import logging
from pathlib import Path

from app.extraction.passes.llm_client import call_llm

logger = logging.getLogger("pressure_test.generator")

_PROMPT_DIR = Path(__file__).parent


def _fill_template(template: str, **kwargs: str) -> str:
    """Substitute {key} placeholders without choking on JSON example braces in prompts."""
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



_REQUIRED_VECTORS = ("execution", "financial", "external")

_PROBE_INSTRUCTIONS = {
    "realism": "Ask whether the specific numbers, timeline, or plan the founder described are realistic given real-world constraints.",
    "fallback": "Ask what the founder will do if the plan they described fails or the assumption turns out to be wrong.",
    "threshold": "Ask the founder to identify the specific minimum condition (number, date, or event) below which this option becomes non-viable.",
}


def _validate_roots(raw_list: list) -> list[dict]:
    """Validate and normalise the 3-root pre-generate LLM output."""
    seen_vectors: set[str] = set()
    result: list[dict] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        vector = str(item.get("failure_vector") or "").strip().lower()
        if vector not in _REQUIRED_VECTORS or vector in seen_vectors:
            continue
        think_about = item.get("think_about") or item.get("thinkAbout") or []
        if not item.get("scenario") or not item.get("question"):
            continue
        probe_depth = int(item.get("probe_depth") or 1)
        priority = int(item.get("priority") or len(result) + 1)
        result.append({
            "failure_vector": vector,
            "scenario": str(item["scenario"])[:400],
            "question": str(item["question"])[:300],
            "think_about": [str(t)[:80] for t in think_about[:3]],
            "probe_depth": max(1, min(2, probe_depth)),
            "priority": priority,
        })
        seen_vectors.add(vector)
        if len(result) == 3:
            break
    return result


async def pre_generate_roots(clarify_draft: dict, weak_spots: list[dict] | None = None) -> list[dict]:
    """
    Fast pre-generation of 3 root scenarios (execution / financial / external)
    from a clarify draft. One LLM call, returns normalised root dicts.

    weak_spots: patterns from PatternProfile where count >= 2. When present,
    at least 2 of the 3 scenarios are biased toward the founder's known failure modes.

    Returns [] if draft is too thin or LLM fails.
    """
    title = (clarify_draft.get("title") or "").strip()
    core_problem = (
        clarify_draft.get("coreProblem") or clarify_draft.get("core_problem") or ""
    ).strip()
    if len(f"{title} {core_problem}") < 20:
        return []

    constraints = clarify_draft.get("constraints") or []
    assumptions = clarify_draft.get("assumptions") or []

    if weak_spots:
        weak_spots_text = "\n".join(f"- {p['pattern']}" for p in weak_spots[:3])
    else:
        weak_spots_text = "(none — generate scenarios based on stated assumptions only)"

    template = (_PROMPT_DIR / "pre_generate_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        title=title or "(not provided)",
        core_problem=core_problem or "(not provided)",
        context=str(clarify_draft.get("context") or "(not provided)"),
        constraints=", ".join(str(c) for c in constraints) if constraints else "(none)",
        assumptions=", ".join(str(a) for a in assumptions) if assumptions else "(none)",
        weak_spots=weak_spots_text,
    )

    temperature = 0.4
    for attempt in range(2):
        try:
            raw, _, _, _ = await call_llm(prompt, temperature=temperature, max_tokens=900)
            parsed = json.loads(_clean_fences(raw))
            roots = _validate_roots(parsed)
            if roots:
                return roots
            if attempt == 0:
                logger.warning("pre_generate_roots: validation produced no roots, retrying")
                temperature = 0.2
                continue
            return []
        except json.JSONDecodeError:
            if attempt == 0:
                logger.warning("pre_generate_roots: JSON parse failed, retrying at lower temperature")
                temperature = 0.2
                continue
            logger.warning("pre_generate_roots: JSON parse failed after 2 attempts")
            return []
        except Exception:
            logger.warning("pre_generate_roots: LLM call failed", exc_info=True)
            return []
    return []


async def generate_follow_up(
    question: str,
    answer: str,
    failure_vector: str,
    probe_type: str,
) -> str | None:
    """
    Generate a single targeted follow-up probe question.
    Returns the question string or None on failure.
    """
    instruction = _PROBE_INSTRUCTIONS.get(probe_type, _PROBE_INSTRUCTIONS["realism"])
    template = (_PROMPT_DIR / "follow_up_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        question=question[:200],
        answer=answer[:300],
        failure_vector=failure_vector,
        probe_type=probe_type,
        probe_instruction=instruction,
    )
    try:
        raw, _, _, _ = await call_llm(
            prompt,
            temperature=0.3,
            max_tokens=60,
        )
        follow_up = raw.strip().strip('"').strip()
        return follow_up if len(follow_up) > 10 else None
    except Exception:
        logger.warning("generate_follow_up failed", exc_info=True)
        return None


