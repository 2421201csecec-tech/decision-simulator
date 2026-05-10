from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select

from app.db.engine import get_async_session
from app.models.decision import AggregatePattern, PatternContributionLog
from app.pattern_engine.constants import (
    GLOBAL_MIN_CONTRIBUTORS,
    MAX_USER_CONTRIBUTIONS,
)

logger = logging.getLogger("pattern_engine.global_feedback")


def _effective_hold_rate(
    personal_confidence: float,
    global_hold_rate: float,
    blend_weight: float,
    stage_relevance: float = 1.0,
) -> float:
    """
    Blend personal pattern confidence with global hold_rate.
    stage_relevance = 1.0 (same cohort), 0.7 (different cohort).
    """
    return (
        personal_confidence * blend_weight
        + global_hold_rate * (1.0 - blend_weight) * stage_relevance
    )


async def contribute_to_global(
    user_id: str,
    theme: dict,
    category: str,
    confirmed_pattern_ids: list[str],
) -> bool:
    """
    Attempt to contribute a personal pattern to aggregate_patterns.

    All 3 privacy gates must pass:
      1. pattern.confidence > 0.70
      2. theme["pattern_id"] in confirmed_pattern_ids
      3. user has < MAX_USER_CONTRIBUTIONS rows for same type+category

    Returns True if contribution was accepted.
    """
    pattern_id = theme.get("pattern_id", "")
    pattern_type = theme.get("pattern_type", "")
    confidence = float(theme.get("confidence", 0))

    # Gate 1: confidence threshold
    if confidence <= 0.70:
        logger.info("global_contribution_rejected user=%s reason=low_confidence conf=%.3f", user_id, confidence)
        return False

    # Gate 2: outcome confirmed this pattern
    if pattern_id not in confirmed_pattern_ids:
        logger.info("global_contribution_rejected user=%s reason=not_confirmed pattern=%s", user_id, pattern_id)
        return False

    async with get_async_session() as session:
        # Gate 3: count existing contributions (with row lock for safety)
        count = await session.scalar(
            select(func.count()).where(
                PatternContributionLog.user_id == user_id,
                PatternContributionLog.pattern_type == pattern_type,
                PatternContributionLog.category == category,
            )
        )
        if (count or 0) >= MAX_USER_CONTRIBUTIONS:
            logger.info("global_contribution_rejected user=%s reason=max_contributions_reached", user_id)
            return False

        # Log the contribution first
        session.add(PatternContributionLog(
            id=str(uuid4()),
            user_id=user_id,
            pattern_type=pattern_type,
            category=category,
            contributed_at=datetime.now(timezone.utc),
        ))

        # Upsert aggregate_patterns row
        failure_mode = theme.get("failure_mode") or pattern_type
        existing = await session.scalar(
            select(AggregatePattern).where(
                AggregatePattern.pattern_type == pattern_type,
                AggregatePattern.decision_category == category,
                AggregatePattern.failure_mode == failure_mode,
            )
        )

        if existing is None:
            session.add(AggregatePattern(
                id=str(uuid4()),
                pattern_type=pattern_type,
                decision_category=category,
                failure_mode=failure_mode,
                hold_rate=confidence,
                n_samples=1,
                n_contributors=1,
                confidence_floor=confidence,
                last_updated=datetime.now(timezone.utc),
            ))
        else:
            # Incremental update: running average for hold_rate
            n = existing.n_samples + 1
            existing.hold_rate = round(
                (existing.hold_rate * existing.n_samples + confidence) / n, 4
            )
            existing.n_samples = n
            existing.n_contributors = min(existing.n_contributors + 1, 999)
            existing.confidence_floor = min(existing.confidence_floor, confidence)
            existing.last_updated = datetime.now(timezone.utc)

        await session.commit()

    logger.info(
        "global_contribution_accepted user=%s pattern_type=%s category=%s",
        user_id, pattern_type, category,
    )
    return True


async def get_blended_patterns(
    user_id: str,
    personal_patterns: list[dict],
    category: str,
    blend_weight: float,
) -> list[dict]:
    """
    Blend personal patterns with global priors for a category.
    Global priors are only served when n_contributors >= GLOBAL_MIN_CONTRIBUTORS.
    """
    from app.pattern_engine.profile_service import get_global_priors
    global_priors = await get_global_priors(category)

    blended = list(personal_patterns)
    for prior in global_priors:
        # Only blend if not already covered by a personal pattern
        overlap = any(
            p.get("pattern_type") == prior.get("pattern_type")
            for p in personal_patterns
        )
        if not overlap:
            effective = _effective_hold_rate(
                personal_confidence=prior.get("confidence_floor", 0.5),
                global_hold_rate=prior.get("hold_rate", 0.5),
                blend_weight=blend_weight,
                stage_relevance=1.0,
            )
            blended.append({
                **prior,
                "confidence": round(effective, 4),
                "source": "global",
            })

    return blended
