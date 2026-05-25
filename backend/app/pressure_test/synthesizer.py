from __future__ import annotations

import json
import logging
from pathlib import Path

from app.extraction.passes.llm_client import call_llm
from app.config import settings

logger = logging.getLogger("pressure_test.synthesizer")

_PROMPT_DIR = Path(__file__).parent


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


def _build_qa_text(pressure_test: dict) -> str:
    """Flatten v2 rootScenarios (with answers and probes) into Q/A text for synthesis."""
    lines: list[str] = []
    for root in (pressure_test.get("rootScenarios") or []):
        vector = root.get("failure_vector", "")
        q = root.get("question", "")
        a = root.get("answer") or ""
        if q:
            lines.append(f"[{vector}] Q: {q[:120]}")
            lines.append(f"  A: {(a or '(skipped)')[:200]}")
        for probe in (root.get("probes") or []):
            pq = probe.get("question", "")
            pa = probe.get("answer") or ""
            if pq and (pa or probe.get("status") == "answered"):
                lines.append(f"  Follow-up: {pq[:100]}")
                lines.append(f"  A: {(pa or '(no answer)')[:150]}")
    return "\n".join(lines) or "(no responses)"


async def synthesize_pressure_test(
    pressure_test: dict,
    extraction_schema: dict | None = None,
) -> dict | None:
    """
    Generate a compact structured summary from answered rootScenarios.
    Returns summary dict or None on failure.
    """
    decision = ""
    if extraction_schema:
        decision = (extraction_schema.get("decision") or "")[:100]

    qa_text = _build_qa_text(pressure_test)
    if qa_text == "(no responses)":
        return None

    template = (_PROMPT_DIR / "synthesis_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        decision=decision or "(not specified)",
        qa_pairs=qa_text,
    )

    try:
        raw, _, _, _ = await call_llm(prompt, temperature=0.2, max_tokens=350, model=settings.llm_fallback_model)
        data = json.loads(_clean_fences(raw))
        return {
            "what_founder_believed": list(data.get("what_founder_believed") or [])[:3],
            "commitments_made": list(data.get("commitments_made") or []),
            "unresolved_risks": list(data.get("unresolved_risks") or []),
            "commitmentQuality": data.get("commitmentQuality", "adequate"),
        }
    except Exception:
        logger.warning("synthesize_pressure_test failed", exc_info=True)
        return None
