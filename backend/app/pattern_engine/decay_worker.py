from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, text

from app.db.engine import get_async_session
from app.models.decision import PatternProfile
from app.pattern_engine.constants import DECAY_FLOOR_GLOBAL
from app.pattern_engine.decay import decay_pattern

logger = logging.getLogger("pattern_engine.decay_worker")

_ADVISORY_LOCK_ID = 8675309  # stable integer for decay worker lock


async def run_decay_pass() -> None:
    """
    Nightly decay pass:
    1. Acquires Postgres advisory lock — exits immediately if another worker holds it.
    2. Loads all pattern_profiles with themes.
    3. Applies decay_pattern() to each theme.
    4. Archives themes where new_conf < DECAY_FLOOR_GLOBAL (marks archived=True).
    5. Writes updated themes back.
    """
    import app.pattern_engine.constants as _c
    from app.config import settings

    if not settings.pattern_engine_enabled or not _c.ENABLE_DECAY_WORKER:
        return

    async with get_async_session() as session:
        # Try advisory lock
        acquired = await session.scalar(
            text("SELECT pg_try_advisory_lock(:lock_id)").bindparams(lock_id=_ADVISORY_LOCK_ID)
        )
        if not acquired:
            logger.info("decay_already_running — advisory lock held by another worker")
            return

        try:
            result = await session.execute(
                select(PatternProfile).where(PatternProfile.themes.isnot(None))
            )
            profiles = result.scalars().all()

            total_decayed = 0
            total_archived = 0

            logger.info("decay_pass_start patterns_loaded=%d profiles", len(profiles))

            for profile in profiles:
                themes: list[dict] = list(profile.themes or [])
                updated_themes = []

                for theme in themes:
                    if theme.get("archived"):
                        updated_themes.append(theme)
                        continue

                    decayed = decay_pattern(theme)
                    total_decayed += 1

                    if float(decayed["confidence"]) <= DECAY_FLOOR_GLOBAL:
                        decayed["archived"] = True
                        decayed["archived_at"] = datetime.now(timezone.utc).isoformat()
                        total_archived += 1
                    updated_themes.append(decayed)

                profile.themes = updated_themes
                profile.updated_at = datetime.now(timezone.utc)

            await session.commit()

            logger.info(
                "decay_pass_complete patterns_decayed=%d patterns_archived=%d",
                total_decayed, total_archived,
            )
        finally:
            # Always release the advisory lock
            await session.execute(
                text("SELECT pg_advisory_unlock(:lock_id)").bindparams(lock_id=_ADVISORY_LOCK_ID)
            )
