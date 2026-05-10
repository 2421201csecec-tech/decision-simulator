from __future__ import annotations

import logging
import math
from collections import OrderedDict

from app.pattern_engine.constants import (
    BLEND_WEIGHT_BIAS,
    ENRICHMENT_MAX_PATTERNS,
    IMPORTANCE_BOOST_SIM,
    INJECT_THRESHOLD,
    MAX_PATTERNS_INJECTED,
)

logger = logging.getLogger("pattern_engine.importance_boost")

_ESCALATE = {"low": "medium", "medium": "high", "high": "critical"}
_EMBED_CACHE: OrderedDict[str, list[float]] = OrderedDict()
_EMBED_CACHE_MAX = 128


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _embed_sync(text: str) -> list[float]:
    """Synchronously embed text, with in-process LRU cache."""
    if text in _EMBED_CACHE:
        return _EMBED_CACHE[text]

    try:
        from app.extraction.memory.embedder import _model
        if _model is None:
            return []
        vec = next(iter(_model.embed([text]))).tolist()
    except Exception:
        logger.warning("embed_sync failed for text: %s", text[:60], exc_info=True)
        return []

    _EMBED_CACHE[text] = vec
    if len(_EMBED_CACHE) > _EMBED_CACHE_MAX:
        _EMBED_CACHE.popitem(last=False)
    return vec


def apply_pattern_importance_boost(
    variables: list[dict],
    active_patterns: list[dict],
    blend_weight: float,
) -> list[dict]:
    """
    Post-Pass-2 hook: escalate variable importance when a high-confidence pattern
    cosine-matches the variable name. Writes only to importance, pattern_id_ref,
    and extraction_confidence — never adds or removes variables.
    """
    if len(active_patterns) > ENRICHMENT_MAX_PATTERNS:
        logger.info("importance_boost skipped — too many patterns (%d), dedup needed", len(active_patterns))
        return variables

    top_patterns = [
        p for p in active_patterns[:MAX_PATTERNS_INJECTED]
        if p.get("embedding") and float(p.get("confidence", 0)) >= INJECT_THRESHOLD
    ]

    if not top_patterns:
        return variables

    boosted_count = 0
    for var in variables:
        var_name = str(var.get("name", ""))
        if not var_name:
            continue
        var_emb = _embed_sync(var_name)
        if not var_emb:
            continue

        for pat in top_patterns:
            pat_emb = pat["embedding"]
            if isinstance(pat_emb, list):
                sim = _cosine_sim(var_emb, pat_emb)
            else:
                continue

            if sim > IMPORTANCE_BOOST_SIM:
                if blend_weight >= BLEND_WEIGHT_BIAS:
                    old_imp = var.get("importance", "low")
                    var["importance"] = _ESCALATE.get(old_imp, old_imp)
                var["pattern_id_ref"] = pat.get("pattern_id", "")
                var["extraction_confidence"] = max(float(var.get("extraction_confidence", 0)), 0.80)
                boosted_count += 1
                break

    if boosted_count:
        logger.info("importance_boost_applied vars_boosted=%d patterns_used=%d", boosted_count, len(top_patterns))
    return variables
