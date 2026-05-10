from __future__ import annotations

import math
from datetime import datetime, timezone


def compute_confidence(
    recency_days: float,
    consistency: float | None,
    outcome_confirmation: float | None,
    count: int,
) -> float:
    """
    confidence = recency×0.30 + consistency×0.35 + outcome_confirm×0.25 + count×0.10

    recency_days: days since last_seen (0 = today, higher = older)
    consistency:  0.0–1.0 (fraction of times pattern appeared consistently)
    outcome_confirmation: 0.0–1.0 (fraction of outcomes that confirmed this pattern)
    count: number of times the pattern has been observed

    Cold-start defaults: consistency=0.50, outcome_confirmation=0.50
    """
    # Recency signal: exponential decay with 90-day half-life
    recency = math.exp(-recency_days / 90) if recency_days >= 0 else 1.0

    cons = float(consistency) if consistency is not None else 0.50
    outcome_conf = float(outcome_confirmation) if outcome_confirmation is not None else 0.50

    # Count signal: logarithmic growth capped at 1.0
    count_signal = min(1.0, math.log1p(max(0, count)) / math.log1p(10))

    raw = (
        recency * 0.30
        + cons * 0.35
        + outcome_conf * 0.25
        + count_signal * 0.10
    )
    return round(min(1.0, max(0.0, raw)), 4)


def recency_days_from(last_seen_iso: str | None) -> float:
    """Parse ISO timestamp and return days since then. Returns 0 on parse failure."""
    if not last_seen_iso:
        return 0.0
    try:
        dt = datetime.fromisoformat(last_seen_iso.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - dt
        return max(0.0, delta.total_seconds() / 86400)
    except (ValueError, TypeError):
        return 0.0
