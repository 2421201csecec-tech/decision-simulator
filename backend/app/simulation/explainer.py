from __future__ import annotations

import json
import logging
from pathlib import Path

from app.extraction.passes.llm_client import call_llm

logger = logging.getLogger("simulation.explainer")

_PROMPT_DIR = Path(__file__).parent
_REQUIRED_KEYS = {"verdict", "risk_alert", "key_assumption"}


def _fill_template(template: str, **kwargs: str) -> str:
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


def _resolve_variable_name(schema: dict, variable_id: str | None) -> str:
    if not variable_id:
        return "(unknown)"
    for v in schema.get("variables") or []:
        if v.get("variable_id") == variable_id:
            return v.get("name") or variable_id
    return variable_id


async def generate_explanation(
    schema: dict,
    options: list[dict],
    confidence: float,
    key_variable_id: str | None,
) -> dict | None:
    """Generate verdict, risk_alert, key_assumption from simulation metrics.

    options[] contains all 9 metrics per option (mean, std, downside, cvar, upside,
    score, best_case, base_case, worst_case) plus id and label.
    key_variable_id is computed by sensitivity analysis — not guessed.
    Returns None on failure.
    """
    if not options:
        return None

    winner = options[0]
    runner = options[1] if len(options) > 1 else None

    key_variable_name = _resolve_variable_name(schema, key_variable_id)

    template = (_PROMPT_DIR / "simulation_explain_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        decision=schema.get("decision") or "(not specified)",
        winner_label=winner.get("label") or winner.get("id") or "Option A",
        winner_score=str(winner.get("score", 0)),
        winner_mean=str(winner.get("mean", 0)),
        winner_downside_pct=str(round(float(winner.get("downside", 0)) * 100, 1)),
        winner_cvar=str(winner.get("cvar", 0)),
        runner_label=runner.get("label") or runner.get("id") or "Option B" if runner else "N/A",
        runner_score=str(runner.get("score", 0)) if runner else "N/A",
        runner_mean=str(runner.get("mean", 0)) if runner else "N/A",
        runner_downside_pct=str(round(float(runner.get("downside", 0)) * 100, 1)) if runner else "N/A",
        runner_cvar=str(runner.get("cvar", 0)) if runner else "N/A",
        confidence_pct=str(round(confidence * 100, 1)),
        key_variable_name=key_variable_name,
        key_variable_id=key_variable_id or "(unknown)",
    )

    try:
        raw, _, _, _ = await call_llm(prompt, temperature=0.2, max_tokens=500)
        parsed = json.loads(_clean_fences(raw))
        if not _REQUIRED_KEYS.issubset(parsed.keys()):
            missing = _REQUIRED_KEYS - parsed.keys()
            logger.warning("simulation explanation missing keys: %s", missing)
            return None
        return {k: parsed[k] for k in _REQUIRED_KEYS}
    except Exception:
        logger.warning("simulation explanation generation failed", exc_info=True)
        return None
