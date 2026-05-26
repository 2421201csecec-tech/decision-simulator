from __future__ import annotations

import json
import time
from pathlib import Path

from app.config import settings
from app.extraction.telemetry.emitter import emit_pass
from .llm_client import call_llm, LLMError

_PROMPT_DIR = Path(__file__).parent.parent / "prompts"
_PASS_NUM = 3
_MAX_TOKENS = 4000


class PassParseError(Exception):
    pass


def _load_prompt() -> str:
    path = _PROMPT_DIR / f"pass3_v{settings.prompt_version}.txt"
    return path.read_text(encoding="utf-8")


async def run_pass3(
    user_input: str,
    combined_schema: dict,
    pattern_context: str = "",
    error_context: str = "",
) -> dict:
    """Run Pass 3: extract assumptions, risks, hidden_deps, known_unknowns.

    pattern_context: optional PATTERN_INJECTION_BLOCK appended after the prompt (no template change).
    Returns parsed dict with those four keys. Raises PassParseError on bad JSON.
    """
    prompt = _load_prompt().format(
        user_input=user_input,
        prior_schema=json.dumps(combined_schema, indent=2),
        error_context=error_context,
    ) + pattern_context

    start = time.monotonic()
    raw, model_used, tokens_in, tokens_out = await call_llm(
        prompt, temperature=0.15, max_tokens=_MAX_TOKENS, model=settings.llm_fallback_model
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
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PassParseError(f"Pass 3 returned invalid JSON: {exc}") from exc

    return {
        "assumptions": parsed.get("assumptions", []),
        "risks": parsed.get("risks", []),
        "hidden_deps": parsed.get("hidden_deps", []),
        "known_unknowns": parsed.get("known_unknowns", []),
    }
