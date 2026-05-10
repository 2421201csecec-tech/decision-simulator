from __future__ import annotations

import math

from app.pattern_engine.confidence import recency_days_from
from app.pattern_engine.constants import DECAY_FLOOR_CONFIRMED, DECAY_FLOOR_GLOBAL, DECAY_HALFLIFE_DAYS


def decay_pattern(theme: dict) -> dict:
    """
    Apply three multiplicative decay factors to a theme's confidence.

    F1: Recency     — exponential decay with DECAY_HALFLIFE_DAYS half-life
    F2: Disconfirmation — 1 − 0.30 × non_trigger_rate
    F3: Outcome correction — 1 − 0.40 × wrong_rate

    Floors:
      - DECAY_FLOOR_CONFIRMED (0.40) when outcome_confirmation >= 0.85
      - DECAY_FLOOR_GLOBAL (0.15) otherwise
    """
    current_conf = float(theme.get("confidence", 0.5))

    # F1: Recency
    days = recency_days_from(theme.get("last_seen"))
    f1 = math.exp(-days * math.log(2) / DECAY_HALFLIFE_DAYS) if days > 0 else 1.0

    # F2: Disconfirmation — non_trigger_rate tracks how often the pattern was
    # present in a relevant context but did NOT trigger
    non_trigger_rate = float(theme.get("non_trigger_rate", 0.0))
    f2 = max(0.0, 1.0 - 0.30 * non_trigger_rate)

    # F3: Outcome correction — wrong_rate tracks predictions that proved incorrect
    wrong_rate = float(theme.get("wrong_rate", 0.0))
    f3 = max(0.0, 1.0 - 0.40 * wrong_rate)

    new_conf = current_conf * f1 * f2 * f3

    # Apply floor
    outcome_confirmation = float(theme.get("outcome_confirmation", 0.0))
    floor = DECAY_FLOOR_CONFIRMED if outcome_confirmation >= 0.85 else DECAY_FLOOR_GLOBAL
    new_conf = max(floor, round(new_conf, 4))

    theme = dict(theme)
    theme["confidence"] = new_conf
    theme["_decay_applied"] = True
    return theme
