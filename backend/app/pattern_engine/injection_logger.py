from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from app.db.engine import get_async_session
from app.models.decision import PatternInjectionLog

logger = logging.getLogger("pattern_engine.injection_logger")

_LAMBDA_BASE = {"lambda1": 0.30, "lambda2": 0.40, "lambda3": 0.10, "lambda4": 0.20}


async def log_injection(
    decision_id: str,
    user_id: str,
    caps: dict,
    lambda_adjusted: dict | None = None,
    pass3_injected: bool = False,
    enrichment_gaps_added: int = 0,
) -> None:
    """
    Write a pattern_injection_log row. Fire-and-forget — failures are logged, not raised.
    Called after enrichment completes (even in shadow mode with empty injected arrays).
    """
    try:
        active = caps.get("active_patterns") or []
        injected_ids = [
            str(p.get("pattern_id", ""))
            for p in active[:3]
            if caps.get("use_pattern_injection") and p.get("pattern_id")
        ]
        considered_ids = [str(p.get("pattern_id", "")) for p in active if p.get("pattern_id")]

        record = PatternInjectionLog(
            log_id=str(uuid4()),
            decision_id=decision_id,
            user_id=user_id,
            blend_weight=float(caps.get("blend_weight", 0)),
            patterns_considered=considered_ids,
            patterns_injected=injected_ids,
            patterns_rejected=None,
            lambda_base=_LAMBDA_BASE,
            lambda_adjusted=lambda_adjusted,
            experiment_group=caps.get("experiment_group"),
            pass3_injected=pass3_injected,
            enrichment_gaps_added=enrichment_gaps_added,
            created_at=datetime.now(timezone.utc),
        )
        async with get_async_session() as session:
            session.add(record)
            await session.commit()

        logger.info(
            "injection_log_written decision_id=%s patterns_considered=%d patterns_injected=%d",
            decision_id, len(considered_ids), len(injected_ids),
        )
    except Exception:
        logger.warning("injection_logger failed for decision %s", decision_id, exc_info=True)
