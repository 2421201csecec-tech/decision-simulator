from __future__ import annotations

import json
import logging
from pathlib import Path

from app.extraction.passes.llm_client import call_llm
from app.config import settings

logger = logging.getLogger("simulation.explainer")

_PROMPT_DIR = Path(__file__).parent
_HARD_REQUIRED = {"verdict", "key_assumption"}
_SOFT_REQUIRED = {"ideal_case", "base_case", "worst_case"}


def _fill_template(template: str, **kwargs: str) -> str:
    result = template
    for key, value in kwargs.items():
        result = result.replace("{" + key + "}", value)
    return result

#this function generates a human-readable explanation for the results of a simulation,
# using a language model (LLM) to analyze the simulation output and produce insights. 
#It takes in the simulation schema, the options with their metrics, the confidence level, 
#the key variable identified by sensitivity analysis, any user-provided values, and the thread context 
#from previous interactions. The function constructs a prompt based on a template and calls the LLM to generate an explanation, 
#which includes a verdict, key assumptions, and per-case bullet points. The output is structured as a dictionary and includes error 
#handling to ensure that if the LLM call fails or returns incomplete data, the function can still return a meaningful response.

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


def _format_avm_context(schema: dict, user_values: dict[str, float]) -> str:
    """For each action, show what it does to each variable vs. what the user selected.
    This grounds the LLM in real-world numbers per option, not just winner metrics.
    """
    actions = schema.get("actions") or []
    variables = schema.get("variables") or []
    avm = schema.get("action_variable_map") or {}
    if not actions or not variables or not avm:
        return ""

    var_map = {v.get("variable_id", ""): v for v in variables}

    def _fmt(val: float, var: dict) -> str:
        unit = (var.get("unit") or "").lower()
        r = var.get("range") or [0, 1]
        hi = float(r[1])
        name_lower = (var.get("name") or "").lower()
        if "rs" in unit or "₹" in unit or "rupee" in unit or "inr" in unit:
            return f"₹{int(val):,}"
        if "%" in unit or "rate" in name_lower or "ratio" in name_lower or "growth" in name_lower:
            return f"{val * 100:.1f}%" if val <= 1 else f"{val:.1f}%"
        if val == int(val):
            if hi <= 10:
                return f"{int(val)}/{int(hi)}"
            return str(int(val))
        return str(round(val, 2))

    lines = ["ACTION VARIABLE IMPACTS (what each option assumes for each variable):"]
    for action in actions:
        action_id = action.get("action_id") or action.get("id") or ""
        label = action.get("label") or action_id
        action_vars = avm.get(action_id, {})
        lines.append(f"\n{label}:")
        for var in variables:
            if var.get("type") not in ("continuous", "ordinal"):
                continue
            vid = var.get("variable_id", "")
            vname = var.get("name") or vid
            override = action_vars.get(vid) or action_vars.get(f"var_{vid}")
            user_val = user_values.get(vid)
            r = var.get("range") or [0, 1]

            if override is not None:
                override_str = _fmt(float(override), var)
                user_str = _fmt(float(user_val), var) if user_val is not None else "midpoint"
                lines.append(f"  - {vname}: this option targets {override_str} (you set: {user_str}; range: {r[0]}–{r[1]})")
            elif user_val is not None:
                user_str = _fmt(float(user_val), var)
                lines.append(f"  - {vname}: no specific target (you set: {user_str}; range: {r[0]}–{r[1]})")

    return "\n".join(lines)


def _format_user_values(schema: dict, user_values: dict[str, float]) -> str:
    """Build a human-readable list of the user's selected variable values."""
    lines = []
    for v in schema.get("variables") or []:
        vid = v.get("variable_id", "")
        val = user_values.get(vid)
        if val is None:
            continue
        name = v.get("name") or vid
        unit = (v.get("unit") or "").lower()
        r = v.get("range") or [0, 1]
        name_lower = (name or "").lower()

        if "rs" in unit or "₹" in unit or "rupee" in unit or "inr" in unit:
            formatted = f"₹{int(val):,}"
        elif "%" in unit or "rate" in name_lower or "ratio" in name_lower or "growth" in name_lower:
            formatted = f"{val * 100:.1f}%" if val <= 1 else f"{val:.1f}%"
        elif val == int(val):
            formatted = str(int(val))
        else:
            formatted = str(round(val, 2))

        lines.append(f"  - {name}: {formatted} (range: {r[0]}–{r[1]})")
    return "\n".join(lines) or "  (no user values provided)"


async def generate_explanation(
    schema: dict,
    options: list[dict],
    confidence: float,
    key_variable_id: str | None,
    user_values: dict[str, float] | None = None,
    thread_context: str = "",
) -> dict | None:
    """Generate verdict, key_assumption, and per-case bullet arrays.

    options[] contains all 9 metrics per option. key_variable_id is computed
    by sensitivity analysis. user_values lets the LLM reference real-world
    numbers in bullets instead of generic statements.
    thread_context carries the founder's clarify form + pressure test responses
    so the LLM can ground bullets in what was already tested and stated.
    Returns None on hard failure (missing verdict/key_assumption).
    """
    if not options:
        return None

    winner = options[0]
    runner = options[1] if len(options) > 1 else None
    uv = user_values or {}

    key_variable_name = _resolve_variable_name(schema, key_variable_id)
    user_values_text = _format_user_values(schema, uv)
    avm_context = _format_avm_context(schema, uv)

    actions_list = schema.get("actions") or []
    actions_text = "\n".join(
        f"  - {a.get('label') or a.get('action_id') or a.get('id', '')}"
        for a in actions_list
    ) or "  (no actions listed)"

    context_block = (
        f"\nFOUNDER'S BACKGROUND (clarify form + pressure test):\n{thread_context}"
        if thread_context.strip() else ""
    )

    avm_block = f"\n{avm_context}" if avm_context.strip() else ""

    template = (_PROMPT_DIR / "simulation_explain_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        decision=schema.get("decision") or "(not specified)",
        actions=actions_text,
        user_values_text=user_values_text,
        thread_context=context_block,
        avm_context=avm_block,
        winner_label=winner.get("label") or winner.get("id") or "Option A",
        winner_score=str(round(float(winner.get("score", 0)), 3)),
        winner_mean=str(round(float(winner.get("mean", 0)), 3)),
        winner_std=str(round(float(winner.get("std", 0)), 3)),
        winner_downside_pct=str(round(float(winner.get("downside", 0)) * 100, 1)),
        winner_cvar=str(round(float(winner.get("cvar", 0)), 3)),
        winner_upside_pct=str(round(float(winner.get("upside", 0)) * 100, 1)),
        winner_best_case=str(round(float(winner.get("best_case", 0)), 3)),
        winner_base_case=str(round(float(winner.get("base_case", 0)), 3)),
        winner_worst_case=str(round(float(winner.get("worst_case", 0)), 3)),
        runner_label=runner.get("label") or runner.get("id") or "Option B" if runner else "N/A",
        runner_score=str(round(float(runner.get("score", 0)), 3)) if runner else "N/A",
        confidence_pct=str(round(confidence * 100, 1)),
        key_variable_name=key_variable_name,
    )

    try:
        raw, _, _, _ = await call_llm(prompt, temperature=0.3, max_tokens=1800, model=settings.llm_fallback_model)
        logger.info("simulation explanation raw LLM output:\n%s", raw)
        parsed = json.loads(_clean_fences(raw))

        if not _HARD_REQUIRED.issubset(parsed.keys()):
            missing = _HARD_REQUIRED - parsed.keys()
            logger.warning("simulation explanation missing required keys: %s", missing)
            return None

        result: dict = {k: parsed[k] for k in _HARD_REQUIRED}
        for k in _SOFT_REQUIRED:
            if k in parsed and isinstance(parsed[k], list):
                result[k] = parsed[k]
            else:
                result[k] = []
                if k not in parsed:
                    logger.warning("explanation missing %s — defaulting to []", k)

        return result
    except Exception:
        logger.warning("simulation explanation generation failed", exc_info=True)
        return None
