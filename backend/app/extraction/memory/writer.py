from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from app.config import settings
from app.db.engine import get_async_session
from app.models.decision import ExtractionMemory

logger = logging.getLogger("extraction.memory.writer")


def should_store(schema: dict) -> bool:
    c = schema.get("confidence", {})
    v = schema.get("validation", {})
    cr = schema.get("consistency_report", {})
    return (
        c.get("overall_confidence", 0) >= settings.min_confidence_for_storage
        and v.get("retry_count", 0) <= 2
        and len(schema.get("variables", [])) >= settings.min_variables_threshold
        and cr.get("overall_score", 1.0) >= 0.75
    )


async def write_extraction_to_memory(schema: dict) -> None:
    try:
        from app.extraction.memory.embedder import build_embedding_string, embed
        emb = await embed(build_embedding_string(schema))
        record = ExtractionMemory(
            id=str(uuid4()),
            decision_category=schema.get("decision_category"),
            overall_confidence=schema.get("confidence", {}).get("overall_confidence", 0.0),
            consistency_score=schema.get("consistency_report", {}).get("overall_score"),
            schema_json=schema,
            embedding=emb or None,
            created_at=datetime.now(timezone.utc),
        )
        async with get_async_session() as session:
            session.add(record)
            await session.commit()
        logger.debug("extraction stored in memory id=%s", record.id)
    except Exception:
        logger.warning("memory write failed — extraction not stored", exc_info=True)
