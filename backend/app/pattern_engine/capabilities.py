from __future__ import annotations

import hashlib
import logging

from app.pattern_engine.constants import (
    AB_CONTROL_PCT,
    BLEND_CONFIDENCE_WEIGHT,
    BLEND_DECISION_WEIGHT,
    BLEND_OUTCOME_WEIGHT,
    BLEND_WEIGHT_BIAS,
    BLEND_WEIGHT_INJECT,
    BLEND_WEIGHT_PREDICT,
    ENABLE_FAILURE_BIASING,
    ENABLE_GLOBAL_PRIORS,
    ENABLE_PATTERN_INJECTION,
    ENABLE_PREDICTIVE_ADJUST,
    INJECT_THRESHOLD,
)
from app.pattern_engine.profile_service import get_active_patterns, get_pattern_profile_row

logger = logging.getLogger("pattern_engine.capabilities")


def compute_blend_weight(n_decisions: int, n_outcomes: int, mean_conf: float) -> float:
    decision_signal = min(1.0, (n_decisions or 0) / 20)
    outcome_signal = min(1.0, (n_outcomes or 0) / 10)
    return (
        decision_signal * BLEND_DECISION_WEIGHT
        + outcome_signal * BLEND_OUTCOME_WEIGHT
        + mean_conf * BLEND_CONFIDENCE_WEIGHT
    )


def get_experiment_group(user_id: str, category: str) -> str:
    """Deterministic, stateless AB assignment. Same input → same group always."""
    h = int(hashlib.sha256(f"{user_id}{category}".encode()).hexdigest(), 16)
    return "treatment" if h % 100 < AB_CONTROL_PCT else "control"


def _mean_confidence(themes: list[dict]) -> float:
    if not themes:
        return 0.0
    confs = [float(t.get("confidence", 0)) for t in themes]
    return sum(confs) / len(confs)


async def get_capabilities(user_id: str, category: str = "") -> dict:
    """
    Compute all pattern engine capability flags for a user+category pair.
    Always called at the start of extraction — flags are False when master kill switch
    or individual ENABLE_* flags are off (shadow mode = all False).
    """
    from app.config import settings

    if not settings.pattern_engine_enabled:
        return _disabled_caps(user_id, category)

    profile = await get_pattern_profile_row(user_id)
    if profile is None:
        bw = 0.0
        mean_conf = 0.0
    else:
        mean_conf = _mean_confidence(profile.themes or [])
        bw = compute_blend_weight(
            profile.n_decisions or 0,
            profile.n_outcomes or 0,
            mean_conf,
        )

    group = get_experiment_group(user_id, category)
    active = await get_active_patterns(user_id, category, min_conf=INJECT_THRESHOLD)

    caps = {
        "blend_weight": round(bw, 4),
        "experiment_group": group,
        "use_pattern_injection": ENABLE_PATTERN_INJECTION and bw >= BLEND_WEIGHT_INJECT,
        "use_failure_biasing": ENABLE_FAILURE_BIASING and bw >= BLEND_WEIGHT_BIAS,
        "use_predictive_adjustment": ENABLE_PREDICTIVE_ADJUST and bw >= BLEND_WEIGHT_PREDICT,
        "use_global_priors": ENABLE_GLOBAL_PRIORS,
        "active_patterns": active,
    }

    logger.info(
        "caps_loaded user=%s category=%s blend_weight=%.3f group=%s use_injection=%s active_patterns=%d",
        user_id, category, bw, group, caps["use_pattern_injection"], len(active),
    )
    return caps


def _disabled_caps(user_id: str, category: str) -> dict:
    return {
        "blend_weight": 0.0,
        "experiment_group": get_experiment_group(user_id, category),
        "use_pattern_injection": False,
        "use_failure_biasing": False,
        "use_predictive_adjustment": False,
        "use_global_priors": False,
        "active_patterns": [],
    }
