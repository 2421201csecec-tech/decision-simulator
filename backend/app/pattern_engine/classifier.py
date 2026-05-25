from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from app.pattern_engine.constants import ENABLE_BEHAVIORAL_PATTERNS
from app.config import settings

logger = logging.getLogger("pattern_engine.classifier")

_MAX_BATCH_INPUTS = 15
_PROMPT_PATH = Path(__file__).parent / "prompts" / "thinking_pattern_classifier_v1.txt"
try:
    _PROMPT_TEMPLATE: str = _PROMPT_PATH.read_text(encoding="utf-8")
except FileNotFoundError:
    logger.error("thinking_pattern_classifier_v1.txt not found — classifier will return []")
    _PROMPT_TEMPLATE = ""


async def classify_inputs_batch(
    inputs: list[dict],
    source: str,
    thread_context: str,
    existing_slugs: list[str],
) -> list[dict]:
    """
    ONE LLM call for all inputs at a trigger point.
    Returns flat list [{slug, statement, field_type, raw_text, evidence}].
    Returns [] if flag off, inputs empty, or LLM/parse fails.
    """
    if not ENABLE_BEHAVIORAL_PATTERNS or not inputs or not _PROMPT_TEMPLATE:
        return []

    if len(inputs) > _MAX_BATCH_INPUTS:
        logger.warning(
            "classify_inputs_batch: dropping %d excess inputs (cap=%d source=%s)",
            len(inputs) - _MAX_BATCH_INPUTS, _MAX_BATCH_INPUTS, source,
        )
        inputs = inputs[:_MAX_BATCH_INPUTS]

    prompt = _PROMPT_TEMPLATE.format(
        source=source,
        thread_context=thread_context[:1200],
        existing_slugs_json=json.dumps(existing_slugs),
        inputs_json=json.dumps(inputs),
    )

    try:
        from app.extraction.passes.llm_client import call_llm
        raw, _, _, _ = await call_llm(prompt, temperature=0.2, max_tokens=500, model=settings.llm_fallback_model)
        result = _parse_batch_response(raw, inputs)
        logger.info("pattern_classify_ok source=%s count=%d", source, len(result))
        return result
    except Exception:
        logger.warning("pattern_classify_error source=%s", source, exc_info=True)
        return []


def _parse_batch_response(raw: str, inputs: list[dict]) -> list[dict]:
    """Parse LLM JSON response into flat pattern list. Returns [] on any error."""
    try:
        # Strip markdown fences if present
        text = raw.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        data = json.loads(text)
        results = data.get("results") or []

        # Build index of inputs by index for field_type lookup
        input_by_index = {item["index"]: item for item in inputs}

        flat: list[dict] = []
        for entry in results:
            idx = entry.get("input_index")
            patterns = entry.get("patterns") or []
            if not patterns or idx is None:
                continue
            source_input = input_by_index.get(idx)
            if not source_input:
                continue
            for pat in patterns:
                slug = (pat.get("slug") or "").strip()
                statement = (pat.get("statement") or "").strip()
                if not slug or not statement:
                    continue
                flat.append({
                    "slug": slug,
                    "statement": statement,
                    "evidence": (pat.get("evidence") or "")[:200],
                    "field_type": source_input.get("field_type", "unknown"),
                    "raw_text": source_input.get("text", ""),
                })
        return flat
    except Exception:
        logger.warning("pattern_parse_error — could not parse LLM response", exc_info=True)
        return []
