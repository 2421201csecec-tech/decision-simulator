from __future__ import annotations

import json
import time
from pathlib import Path

from app.config import settings
from app.extraction.telemetry.emitter import emit_pass
from .llm_client import call_llm, LLMError

_PROMPT_DIR = Path(__file__).parent.parent / "prompts"
_PASS_NUM = 1
_MAX_TOKENS = 1200


class PassParseError(Exception):
    pass


def _load_prompt() -> str:
    path = _PROMPT_DIR / f"pass1_v{settings.prompt_version}.txt"
    return path.read_text(encoding="utf-8")


async def run_pass1(
    user_input: str,
    memory_context: str = "",
    error_context: str = "",
) -> dict:
    """Run Pass 1: extract decision frame (decision, actions, actors, constraints).

    Returns parsed dict. Raises PassParseError on bad JSON. Raises LLMError on model failure.
    """
    prompt = _load_prompt().format(
        user_input=user_input,
        memory_context=memory_context or "No prior context available.",
        error_context=error_context,
    )

    start = time.monotonic()
    raw, model_used, tokens_in, tokens_out = await call_llm(
        prompt, temperature=0.1, max_tokens=_MAX_TOKENS
    )
    latency_ms = int((time.monotonic() - start) * 1000)

    emit_pass(
        pass_num=_PASS_NUM,
        latency_ms=latency_ms,
        model=model_used,
        prompt_version=settings.prompt_version,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        retry=bool(error_context),
    )

    raw = raw.strip()
    # Strip markdown fences if model wraps output despite instructions
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PassParseError(f"Pass 1 returned invalid JSON: {exc}") from exc
