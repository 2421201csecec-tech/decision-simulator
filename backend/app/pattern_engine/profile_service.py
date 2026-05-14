from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.engine import get_async_session
from app.models.decision import AggregatePattern, PatternProfile
from app.pattern_engine.constants import GLOBAL_MIN_CONTRIBUTORS, INJECT_THRESHOLD

logger = logging.getLogger("pattern_engine.profile_service")


def _now() -> datetime:
    return datetime.now(timezone.utc)

# This module implements the core read/write operations for user pattern profiles and global aggregate patterns.
# It provides functions to get active patterns for a user and category, get global priors,
# and upsert themes into a user's pattern profile. It also includes backward-compatible functions to read/write

def _flat_to_theme(pat: dict) -> dict: 
#
    """Convert old flat patterns[] shape to a minimal theme dict for backward compat."""
    return {
        "pattern_id": pat.get("pattern_type", ""),  # no UUID in old shape
        "pattern_type": pat.get("pattern_type", ""),
        "statement": pat.get("pattern", ""),
        "decision_category": None,  # unknown in old shape
        "confidence": min(1.0, 0.3 + 0.1 * int(pat.get("count", 1))),  # heuristic
        "count": pat.get("count", 1),
        "seen_in": pat.get("seen_in", []),
        "first_seen": pat.get("first_seen"),
        "last_seen": pat.get("last_seen"),
        "embedding": None,  # old shape has no embedding — filtered out in boost path
        "failure_mode": pat.get("pattern_type", ""),
    }


async def get_active_patterns(
    user_id: str,
    category: str,
    min_conf: float = INJECT_THRESHOLD,
) -> list[dict]:
    """
    Returns active patterns for a user scoped to category, sorted by confidence desc.
    Reads themes[] first (new shape). Falls back to patterns[] (old shape).
    Patterns without embeddings are included but flagged — importance_boost skips them.
    """
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile.themes, PatternProfile.patterns)
            .where(PatternProfile.user_id == user_id)
        )
        row = result.first()

    if row is None:
        return []

    themes_raw, patterns_raw = row[0], row[1]

    if themes_raw:
        themes: list[dict] = list(themes_raw)
    elif patterns_raw:
        themes = [_flat_to_theme(p) for p in (patterns_raw or [])]
    else:
        return []

    # Scope by category (None means unknown category — skip those entries on old shape)
    scoped = [
        t for t in themes
        if t.get("decision_category") == category or t.get("decision_category") is None
    ]

    # Filter by confidence floor
    qualified = [t for t in scoped if float(t.get("confidence", 0)) >= min_conf]

    # Sort by confidence descending
    qualified.sort(key=lambda t: float(t.get("confidence", 0)), reverse=True)

    return qualified


async def get_global_priors(category: str) -> list[dict]:
    """
    Returns aggregate patterns for category where n_contributors meets the minimum gate.
    Returns [] when the gate is not met — never serves under-contributed priors.
    """
    async with get_async_session() as session:
        result = await session.execute(
            select(AggregatePattern)
            .where(
                AggregatePattern.decision_category == category,
                AggregatePattern.n_contributors >= GLOBAL_MIN_CONTRIBUTORS,
            )
        )
        rows = result.scalars().all()

    return [
        {
            "id": r.id,
            "pattern_type": r.pattern_type,
            "decision_category": r.decision_category,
            "failure_mode": r.failure_mode,
            "hold_rate": r.hold_rate,
            "n_contributors": r.n_contributors,
            "confidence_floor": r.confidence_floor,
            "embedding": r.embedding,
        }
        for r in rows
    ]


async def upsert_theme(user_id: str, theme: dict) -> None:
    """
    Write a new or updated theme to pattern_profiles.themes.
    Uses SELECT FOR UPDATE to prevent concurrent lost updates (R5 safety).
    """
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile)
            .where(PatternProfile.user_id == user_id)
            .with_for_update()
        )
        profile = result.scalar_one_or_none()
        now = _now()

        if profile is None:
            profile = PatternProfile(
                user_id=user_id,
                patterns=[],
                themes=[theme],
                blend_weight=0.0,
                n_decisions=0,
                n_outcomes=0,
                updated_at=now,
                created_at=now,
                version=1,
            )
            session.add(profile)
        else:
            themes: list[dict] = list(profile.themes or [])
            pattern_id = theme.get("pattern_id")
            idx = next((i for i, t in enumerate(themes) if t.get("pattern_id") == pattern_id), -1)
            if idx >= 0:
                themes[idx] = theme
            else:
                themes.append(theme)
            profile.themes = themes
            profile.updated_at = now

        await session.commit()


async def get_pattern_profile_compat(user_id: str) -> dict:
    """
    Backward-compatible reader for the existing /pattern-profile API endpoint.
    Merges themes[] into the flat patterns[] shape so old callers are unaffected.
    """
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile).where(PatternProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()

    if profile is None:
        return {"patterns": []}

    if not profile.themes:
        return {"patterns": list(profile.patterns or [])}

    # Merge themes into flat shape
    flat = []
    for theme in profile.themes:
        flat.append({
            "pattern": theme.get("statement", ""),
            "pattern_type": theme.get("pattern_type", ""),
            "seen_in": theme.get("seen_in", []),
            "count": theme.get("count", 1),
            "first_seen": theme.get("first_seen"),
            "last_seen": theme.get("last_seen"),
            "confidence": theme.get("confidence"),
        })

    return {"patterns": flat}


async def get_pattern_profile_row(user_id: str) -> PatternProfile | None:
    """Return raw ORM row for capabilities computation."""
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile).where(PatternProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()


async def increment_n_decisions(user_id: str) -> None:
    """Increment n_decisions counter under a row-level lock."""
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile)
            .where(PatternProfile.user_id == user_id)
            .with_for_update()
        )
        profile = result.scalar_one_or_none()
        if profile is None:
            return
        profile.n_decisions = (profile.n_decisions or 0) + 1
        profile.updated_at = _now()
        await session.commit()


async def increment_n_outcomes(user_id: str) -> None:
    """Increment n_outcomes counter under a row-level lock."""
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile)
            .where(PatternProfile.user_id == user_id)
            .with_for_update()
        )
        profile = result.scalar_one_or_none()
        if profile is None:
            return
        profile.n_outcomes = (profile.n_outcomes or 0) + 1
        profile.updated_at = _now()
        await session.commit()
