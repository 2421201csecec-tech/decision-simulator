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


def _validate_scenarios(raw_list: list) -> list[dict]:
    result = []
    for s in raw_list[:6]:
        think_about = s.get("thinkAbout") or []
        if len(think_about) < 2:
            continue
        if not s.get("scenario") or not s.get("question"):
            continue
        result.append({
            "scenario": s["scenario"],
            "question": s["question"],
            "thinkAbout": think_about[:3],
        })
    return result


async def _call_with_retry(prompt: str) -> list[dict]:
    """Call LLM with JSON parse retry at lower temperature on first failure."""
    temperature = 0.4
    # Note: LLMError hits except Exception immediately (call_llm has its own primary/fallback retry)
    for attempt in range(2):
        try:
            raw, _, _, _ = await call_llm(prompt, temperature=temperature, max_tokens=1200)
            scenarios = json.loads(_clean_fences(raw))
            return _validate_scenarios(scenarios)
        except json.JSONDecodeError:
            if attempt == 0:
                logger.warning("pressure test JSON parse failed — retrying at temperature=0.2")
                temperature = 0.2
                continue
            logger.warning("pressure test JSON parse failed after 2 attempts")
            return []
        except Exception:
            logger.warning("pressure test LLM call failed", exc_info=True)
            return []
    return []


async def generate_scenarios(source: dict) -> list[dict]:
    """
    Generate 5 targeted pressure-test scenarios.

    Accepts either:
    - An extraction schema (has 'variables' key) → rich path using assumptions/risks
    - A clarify draft (has 'coreProblem' key) → fallback path using raw fields

    Returns list of {scenario, question, thinkAbout} or [] on failure.
    """
    if "variables" in source:
        return await _generate_from_extraction_schema(source)
    return await _generate_from_clarify_draft(source)


async def _generate_from_extraction_schema(schema: dict) -> list[dict]:
    decision = (schema.get("decision") or "").strip()
    if not decision:
        return []

    actions = schema.get("actions") or []
    action_labels = ", ".join(a.get("label", "") for a in actions if a.get("label"))

    all_assumptions = schema.get("assumptions") or []
    high_fragility = [a for a in all_assumptions if float(a.get("fragility", 0)) >= 0.6]
    assumption_lines = "\n".join(
        f"- {a.get('text', '')}" for a in (high_fragility or all_assumptions)[:5]
    ) or "(none stated)"

    all_risks = schema.get("risks") or []
    high_risks = [r for r in all_risks if float(r.get("severity", 0)) >= 0.6]
    risk_lines = "\n".join(
        f"- {r.get('text', '')}" for r in (high_risks or all_risks)[:3]
    ) or "(none stated)"

    hidden_deps = schema.get("hidden_deps") or []
    dep_lines = "\n".join(f"- {d}" for d in hidden_deps[:3]) or "(none)"

    template = (_PROMPT_DIR / "pressure_test_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        decision=decision,
        actions=action_labels or "(not specified)",
        assumptions=assumption_lines,
        risks=risk_lines,
        hidden_deps=dep_lines,
    )
    return await _call_with_retry(prompt)


async def _generate_from_clarify_draft(draft: dict) -> list[dict]:
    # Accept both camelCase (frontend) and snake_case (direct API calls)
    title = (draft.get("title") or "").strip()
    core_problem = (draft.get("coreProblem") or draft.get("core_problem") or "").strip()

    if len(f"{title} {core_problem}") < 20:
        return []

    constraints = draft.get("constraints") or []
    assumptions = draft.get("assumptions") or []

    template = (_PROMPT_DIR / "pressure_test_clarify_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        title=title or "(not provided)",
        core_problem=core_problem or "(not provided)",
        context=draft.get("context") or "(not provided)",
        constraints=", ".join(constraints) if constraints else "(none)",
        assumptions=", ".join(assumptions) if assumptions else "(none)",
    )
    return await _call_with_retry(prompt)
