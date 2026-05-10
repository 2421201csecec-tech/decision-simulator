"""
Standalone migration script for Pattern Engine v2 DB changes.

Run BEFORE starting the app:
    cd backend && python scripts/migrate.py

Safe to run multiple times — all statements use IF NOT EXISTS.
Runs in order; on failure the script stops and raises so the error is visible.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

# Allow `from app.X import Y` when running from backend/
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("migrate")

_DDL_STATEMENTS = [
    # 1a — decisions new columns
    """
    ALTER TABLE decisions
      ADD COLUMN IF NOT EXISTS base_score FLOAT,
      ADD COLUMN IF NOT EXISTS adjusted_score FLOAT,
      ADD COLUMN IF NOT EXISTS experiment_group TEXT
    """,

    # 1b — pattern_profiles new columns
    """
    ALTER TABLE pattern_profiles
      ADD COLUMN IF NOT EXISTS themes JSONB,
      ADD COLUMN IF NOT EXISTS blend_weight FLOAT NOT NULL DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS n_decisions INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS n_outcomes INT NOT NULL DEFAULT 0
    """,

    # 1c — aggregate_patterns table
    """
    CREATE TABLE IF NOT EXISTS aggregate_patterns (
        id                    TEXT PRIMARY KEY,
        pattern_type          TEXT NOT NULL,
        decision_category     TEXT NOT NULL,
        failure_mode          TEXT NOT NULL,
        hold_rate             FLOAT NOT NULL DEFAULT 0.5,
        n_samples             INT NOT NULL DEFAULT 0,
        n_contributors        INT NOT NULL DEFAULT 0,
        severity_distribution JSONB,
        cohort_breakdown      JSONB,
        confidence_floor      FLOAT NOT NULL DEFAULT 0.0,
        embedding             VECTOR(384),
        last_updated          TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_aggregate_pattern UNIQUE (pattern_type, decision_category, failure_mode)
    )
    """,

    "CREATE INDEX IF NOT EXISTS aggregate_patterns_category_idx ON aggregate_patterns (decision_category)",
    "CREATE INDEX IF NOT EXISTS aggregate_patterns_emb_idx ON aggregate_patterns USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50)",

    # 1d — pattern_injection_log table
    """
    CREATE TABLE IF NOT EXISTS pattern_injection_log (
        log_id               TEXT PRIMARY KEY,
        decision_id          TEXT NOT NULL REFERENCES decisions(decision_id),
        user_id              TEXT NOT NULL,
        blend_weight         FLOAT NOT NULL,
        patterns_considered  JSONB,
        patterns_injected    JSONB,
        patterns_rejected    JSONB,
        lambda_base          JSONB NOT NULL,
        lambda_adjusted      JSONB,
        experiment_group     TEXT,
        pass3_injected       BOOLEAN DEFAULT FALSE,
        enrichment_gaps_added INT DEFAULT 0,
        created_at           TIMESTAMPTZ DEFAULT now()
    )
    """,

    "CREATE INDEX IF NOT EXISTS pil_user_idx ON pattern_injection_log (user_id)",
    "CREATE INDEX IF NOT EXISTS pil_decision_idx ON pattern_injection_log (decision_id)",
    "CREATE INDEX IF NOT EXISTS pil_created_idx ON pattern_injection_log (created_at)",

    # 1e — pattern_contribution_log table (no UNIQUE — count enforced in code)
    """
    CREATE TABLE IF NOT EXISTS pattern_contribution_log (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        pattern_type    TEXT NOT NULL,
        category        TEXT NOT NULL,
        contributed_at  TIMESTAMPTZ DEFAULT now()
    )
    """,

    "CREATE INDEX IF NOT EXISTS pcl_user_type_cat_idx ON pattern_contribution_log (user_id, pattern_type, category)",
]


async def run_migrations() -> None:
    # Convert SQLAlchemy URL to asyncpg DSN
    db_url = settings.database_url.replace(
        "postgresql+asyncpg://", "postgresql://"
    ).replace("sqlite+aiosqlite:///", "")

    if not db_url.startswith("postgresql://"):
        logger.warning("Non-Postgres DB detected (%s) — skipping DDL migrations", db_url[:30])
        return

    conn = await asyncpg.connect(db_url)
    try:
        for stmt in _DDL_STATEMENTS:
            stmt = stmt.strip()
            preview = stmt.split("\n")[0][:80]
            logger.info("Running: %s ...", preview)
            await conn.execute(stmt)
            logger.info("OK")
    finally:
        await conn.close()

    logger.info("All migrations complete.")


if __name__ == "__main__":
    asyncio.run(run_migrations())
