from __future__ import annotations

from app.pattern_engine.constants import (
    LAMBDA_MAX_ADJ_L1,
    LAMBDA_MAX_ADJ_L2,
    LAMBDA_MAX_ADJ_L3,
    LAMBDA_MAX_ADJ_L4,
    BIAS_THRESHOLD,
)

_LAMBDA_BASE = {"lambda1": 0.30, "lambda2": 0.40, "lambda3": 0.10, "lambda4": 0.20}


def compute_adjusted_lambdas(
    active_patterns: list[dict],
    blend_weight: float,
    category: str = "",
) -> dict:
    """
    Compute pattern-aware lambda adjustments.

    L1 (volatility penalty) — raised when user has high-fragility patterns
    L2 (downside penalty)   — raised when user has execution failure patterns
    L3 (CVaR tail penalty)  — raised when user has catastrophic tail patterns
    L4 (upside bonus)       — lowered when user consistently over-optimistic

    All adjustments are linear in blend_weight, clamped to LAMBDA_MAX_ADJ_*.
    Returns base lambdas unchanged when no patterns or blend_weight below gate.
    """
    if not active_patterns or blend_weight < BIAS_THRESHOLD:
        return dict(_LAMBDA_BASE)

    adj = dict(_LAMBDA_BASE)

    high_conf = [p for p in active_patterns if float(p.get("confidence", 0)) >= BIAS_THRESHOLD]
    if not high_conf:
        return adj

    # Classify patterns by failure mode
    execution_count = sum(1 for p in high_conf if "execution" in str(p.get("failure_mode", "")).lower())
    overconfidence_count = sum(1 for p in high_conf if "overconfid" in str(p.get("pattern_type", "")).lower() or "overconfid" in str(p.get("statement", "")).lower())
    catastrophic_count = sum(1 for p in high_conf if "catastroph" in str(p.get("failure_mode", "")).lower() or "critical" in str(p.get("pattern_type", "")).lower())

    n = len(high_conf)
    scale = blend_weight  # 0.0–1.0 linear scaling

    # L1: raise volatility penalty when pattern suggests high uncertainty
    if n >= 2:
        adj["lambda1"] = min(
            _LAMBDA_BASE["lambda1"] + LAMBDA_MAX_ADJ_L1 * scale * (n / 5),
            _LAMBDA_BASE["lambda1"] + LAMBDA_MAX_ADJ_L1,
        )

    # L2: raise downside penalty for execution failure history
    if execution_count >= 1:
        adj["lambda2"] = min(
            _LAMBDA_BASE["lambda2"] + LAMBDA_MAX_ADJ_L2 * scale * (execution_count / 3),
            _LAMBDA_BASE["lambda2"] + LAMBDA_MAX_ADJ_L2,
        )

    # L3: raise CVaR penalty for catastrophic tail patterns
    if catastrophic_count >= 1:
        adj["lambda3"] = min(
            _LAMBDA_BASE["lambda3"] + LAMBDA_MAX_ADJ_L3 * scale,
            _LAMBDA_BASE["lambda3"] + LAMBDA_MAX_ADJ_L3,
        )

    # L4: reduce upside bonus for overconfidence patterns
    if overconfidence_count >= 1:
        adj["lambda4"] = max(
            _LAMBDA_BASE["lambda4"] - LAMBDA_MAX_ADJ_L4 * scale,
            _LAMBDA_BASE["lambda4"] - LAMBDA_MAX_ADJ_L4,
        )

    # Round all to 4dp
    return {k: round(v, 4) for k, v in adj.items()}
