from __future__ import annotations

import logging

logger = logging.getLogger("extraction.telemetry")


def emit_pass(
    *,
    pass_num: int,
    latency_ms: int,
    model: str,
    prompt_version: str,
    tokens_in: int = 0,
    tokens_out: int = 0,
    retry: bool = False,
    extra: dict | None = None,
) -> None:
    """Emit per-pass telemetry as a structured log line.

    Langfuse wiring is deferred — this stub keeps the call sites stable.
    """
    logger.info(
        "extraction_pass",
        extra={
            "pass_num": pass_num,
            "latency_ms": latency_ms,
            "model": model,
            "prompt_version": prompt_version,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "retry": retry,
            **(extra or {}),
        },
    )
