from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text

from app.config import settings
from app.db.engine import get_async_session

logger = logging.getLogger("extraction.memory.retriever")


async def retrieve_similar(
    query_text: str,
    category_hint: str | None = None,
    limit: int = 3,
) -> list[dict]:
    if not settings.memory_retrieval_enabled:
        return []

    from app.extraction.memory.embedder import embed
    query_emb = await embed(query_text)
    if not query_emb:
        return []

    async with get_async_session() as session:
        rows = (await session.execute(
            text("""
                SELECT schema_json, decision_category, created_at,
                       1 - (embedding <=> CAST(:emb AS vector)) AS cosine
                FROM extraction_memory
                WHERE embedding IS NOT NULL
                  AND 1 - (embedding <=> CAST(:emb AS vector)) >= :threshold
                ORDER BY embedding <=> CAST(:emb AS vector)
                LIMIT 20
            """),
            {"emb": str(query_emb), "threshold": settings.memory_min_cosine},
        )).fetchall()

    if not rows:
        logger.debug("retrieve_similar: no rows above cosine threshold %.2f", settings.memory_min_cosine)
        return []

    now = datetime.now(timezone.utc)
    scored = []
    for row in rows:
        semantic = float(row.cosine)
        cat_score = 1.0 if (category_hint and row.decision_category == category_hint) else 0.0
        age_days = (now - row.created_at.replace(tzinfo=timezone.utc)).days
        recency = max(0.0, 1.0 - age_days / 365.0)
        scored.append((0.6 * semantic + 0.3 * cat_score + 0.1 * recency, row.schema_json))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = [s[1] for s in scored[:limit]]
    logger.debug("retrieve_similar: retrieved %d similar schemas", len(results))
    return results
