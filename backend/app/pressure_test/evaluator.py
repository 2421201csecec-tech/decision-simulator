from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.config import settings
from app.extraction.passes.llm_client import call_llm

logger = logging.getLogger("pressure_test.evaluator")

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


_VALID_QUALITIES = {"strong", "adequate", "weak", "vague"}
_VALID_PROBE_TYPES = {"realism", "fallback", "threshold"}


@dataclass
class EvaluationResult:
    quality: str = "adequate"
    missing: list[str] = field(default_factory=list)
    next_probe_type: str | None = None
    commitment: str | None = None

    @classmethod
    def fallback(cls) -> "EvaluationResult":
        return cls(quality="adequate", missing=[], next_probe_type=None, commitment=None)


async def evaluate_answer(
    question: str,
    answer: str,
    failure_vector: str,
) -> EvaluationResult:
    """Lightweight answer evaluator. Uses the fast fallback model (~1s target)."""
    if not answer.strip():
        return EvaluationResult(
            quality="vague",
            missing=["numbers", "timeframe", "fallback", "commitment"],
            next_probe_type="fallback",
            commitment=None,
        )

    template = (_PROMPT_DIR / "evaluator_v1.0.0.txt").read_text(encoding="utf-8")
    prompt = _fill_template(
        template,
        question=question[:200],
        failure_vector=failure_vector,
        answer=answer[:400],
    )

    try:
        raw, _, _, _ = await call_llm(
            prompt,
            temperature=0.1,
            max_tokens=120,
            model=settings.llm_fallback_model,
        )
        data = json.loads(_clean_fences(raw))

        quality = data.get("quality", "adequate")
        if quality not in _VALID_QUALITIES:
            quality = "adequate"

        next_probe_type = data.get("next_probe_type")
        if not next_probe_type or next_probe_type == "null":
            next_probe_type = None
        elif next_probe_type not in _VALID_PROBE_TYPES:
            next_probe_type = None

        commitment = data.get("commitment")
        if not commitment or commitment == "null":
            commitment = None
        else:
            commitment = str(commitment)[:200]

        missing = [m for m in (data.get("missing") or []) if isinstance(m, str)]

        return EvaluationResult(
            quality=quality,
            missing=missing,
            next_probe_type=next_probe_type,
            commitment=commitment,
        )
    except Exception:
        logger.warning("evaluate_answer failed — using fallback result", exc_info=True)
        return EvaluationResult.fallback()
