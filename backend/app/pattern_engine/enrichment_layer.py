from __future__ import annotations

import logging
import math
import time

from app.pattern_engine.constants import (
    ENRICHMENT_LATENCY_WARN,
    ENRICHMENT_MAX_PATTERNS,
    IMPORTANCE_BOOST_SIM,
    INJECT_THRESHOLD,
)

logger = logging.getLogger("pattern_engine.enrichment_layer")


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


async def apply_pattern_enrichment(
    schema: dict,
    active_patterns: list[dict],
) -> dict:
    """
    Programmatic cosine enrichment — NO LLM call.
    Writes ONLY to known_unknowns[] and pattern_flags[].
    NEVER writes to variables[].
    Fire-and-forget contract: any exception returns schema unchanged.
    Target: < ENRICHMENT_LATENCY_WARN seconds wall-clock.
    """
    start = time.monotonic()
    try:
        return _enrich(schema, active_patterns)
    except Exception:
        logger.warning("apply_pattern_enrichment failed — returning schema unchanged", exc_info=True)
        return schema
    finally:
        elapsed = time.monotonic() - start
        if elapsed > ENRICHMENT_LATENCY_WARN:
            logger.warning("enrichment_latency_warn wall_clock_ms=%.0f", elapsed * 1000)
        else:
            logger.info(
                "enrichment_complete wall_clock_ms=%.0f",
                elapsed * 1000,
            )


def _enrich(schema: dict, active_patterns: list[dict]) -> dict:
    if len(active_patterns) > ENRICHMENT_MAX_PATTERNS:
        return schema

    qualified = [
        p for p in active_patterns
        if p.get("embedding") and float(p.get("confidence", 0)) >= INJECT_THRESHOLD
    ]
    if not qualified:
        return schema

    # Build embeddings for existing known_unknowns to avoid duplicates
    existing_unknowns = list(schema.get("known_unknowns") or [])
    existing_texts = {
        (ku.get("text") or ku.get("description") or "").lower()
        for ku in existing_unknowns
        if isinstance(ku, dict)
    }

    pattern_flags: list[dict] = list(schema.get("pattern_flags") or [])
    gaps_added = 0

    from app.pattern_engine.importance_boost import _embed_sync, _cosine_sim as _cos

    # Check assumptions against pattern embeddings
    for assumption in (schema.get("assumptions") or []):
        if not isinstance(assumption, dict):
            continue
        text = assumption.get("text") or assumption.get("statement") or ""
        if not text:
            continue
        emb = _embed_sync(text)
        if not emb:
            continue

        for pat in qualified:
            sim = _cos(emb, pat["embedding"])
            if sim > IMPORTANCE_BOOST_SIM:
                pid = pat.get("pattern_id", "")
                if not any(f.get("pattern_id") == pid for f in pattern_flags):
                    pattern_flags.append({
                        "pattern_id": pid,
                        "confidence": round(float(pat.get("confidence", 0)), 3),
                        "matched_on": "assumption",
                        "cosine_sim": round(sim, 3),
                    })

                gap_text = f"Pattern match: {pat.get('statement', '')[:80]}"
                if gap_text.lower() not in existing_texts:
                    existing_unknowns.append({"text": gap_text, "source": "pattern_engine"})
                    existing_texts.add(gap_text.lower())
                    gaps_added += 1
                break

    schema = dict(schema)
    schema["known_unknowns"] = existing_unknowns
    schema["pattern_flags"] = pattern_flags
    schema["pattern_injection_used"] = bool(pattern_flags)

    logger.info(
        "enrichment_complete gaps_added=%d flags_added=%d",
        gaps_added, len(pattern_flags),
    )
    return schema
