from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from app.db.engine import get_async_session
from app.models.decision import ExtractionMemory

logger = logging.getLogger("extraction.memory.writer")

_STORAGE_CRITERIA = {
    "min_confidence": 0.70,
    "max_retry_count": 2,
    "min_variables": 3,
}


def should_store(schema: dict) -> bool:
    c = schema.get("confidence", {})
    v = schema.get("validation", {})
    return (
        c.get("overall_confidence", 0) >= _STORAGE_CRITERIA["min_confidence"]
        and v.get("retry_count", 0) <= _STORAGE_CRITERIA["max_retry_count"]
        and len(schema.get("variables", [])) >= _STORAGE_CRITERIA["min_variables"]
    )


async def write_extraction_to_memory(schema: dict) -> None:
    try:
        record = ExtractionMemory(
            id=str(uuid4()),
            decision_category=schema.get("decision_category"),
            overall_confidence=schema.get("confidence", {}).get("overall_confidence", 0.0),
            schema_json=schema,
            created_at=datetime.now(timezone.utc),
        )
        async with get_async_session() as session:
            session.add(record)
            await session.commit()
        logger.debug("extraction stored in memory id=%s", record.id)
    except Exception:
        logger.warning("memory write failed — extraction not stored", exc_info=True)
