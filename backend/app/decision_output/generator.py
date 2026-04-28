from __future__ import annotations

import json
import logging
from pathlib import Path

from app.extraction.passes.llm_client import call_llm

logger = logging.getLogger("decision_output.generator")

_PROMPT_DIR = Path(__file__).parent

_REQUIRED_KEYS = {
    "finalDecision", "keyReasons", "keyRisks", "assumptions",
    "decisionStrength", "strengths", "weakPoints", "suggestedExperiment",
}


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


def _build_prompt(extraction_schema: dict, qa_pairs: list[dict]) -> str:
    decision = extraction_schema.get("decision") or ""
    actions = extraction_schema.get("actions") or []
    action_labels = ", ".join(a.get("label", "") for a in actions if a.get("label")) or "(not specified)"

    all_assumptions = extraction_schema.get("assumptions") or []
    assumption_lines = "\n".join(
        f"- {a.get('text', '')} (fragility: {a.get('fragility', 'unknown')})"
        for a in all_assumptions[:5]
    ) or "(none extracted)"

    all_risks = extraction_schema.get("risks") or []
    risk_lines = "\n".join(
        f"- {r.get('text', '')} (severity: {r.get('severity', 'unknown')})"
        for r in all_risks[:4]
    ) or "(none extracted)"

    confidence = (extraction_schema.get("confidence") or {}).get("overall_confidence", "unknown")

    if qa_pairs:
        qa_text = "\n\n".join(
            f"Scenario: {qa['context']}\nQuestion: {qa['question']}\nFounder's answer: {qa['answer']}"
            for qa in qa_pairs
        )
    else:
        qa_text = "(No pressure test answers recorded — founder skipped all scenarios)"

    template = (_PROMPT_DIR / "decision_output_v1.0.0.txt").read_text(encoding="utf-8")
    return _fill_template(
        template,
        decision=decision or "(not specified)",
        actions=action_labels,
        assumptions=assumption_lines,
        risks=risk_lines,
        confidence=str(confidence),
        qa_pairs=qa_text,
    )


async def generate_decision_output(extraction_schema: dict, pressure_test: dict) -> dict | None:
    """
    Generate a verdict from extraction schema + pressure test Q&A.
    Returns dict with all 9 DecisionOutputData fields, or None on failure.
    """
    scenarios = {str(s["id"]): s for s in (pressure_test.get("scenarios") or [])}
    responses = pressure_test.get("responses") or {}

    qa_pairs = []
    for sid, resp in responses.items():
        if resp.get("skipped") or not (resp.get("answer") or "").strip():
            continue
        scenario = scenarios.get(sid, {})
        qa_pairs.append({
            "question": scenario.get("question", ""),
            "context": scenario.get("scenario", ""),
            "answer": resp["answer"],
        })

    try:
        prompt = _build_prompt(extraction_schema, qa_pairs)
        raw, _, _, _ = await call_llm(prompt, temperature=0.3, max_tokens=1500)
        parsed = json.loads(_clean_fences(raw))

        if not _REQUIRED_KEYS.issubset(parsed.keys()):
            missing = _REQUIRED_KEYS - parsed.keys()
            logger.warning("decision output missing keys: %s", missing)
            return None

        # Clamp decisionStrength to valid range
        parsed["decisionStrength"] = max(0, min(100, int(parsed.get("decisionStrength", 50))))

        return parsed

    except Exception:
        logger.warning("decision output generation failed", exc_info=True)
        return None
