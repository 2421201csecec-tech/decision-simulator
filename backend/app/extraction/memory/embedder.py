from __future__ import annotations

import asyncio
import logging

from app.config import settings

logger = logging.getLogger("extraction.memory.embedder")

_IMPORTANCE_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}

# Loaded once at module level — first call triggers model download (~50 MB ONNX)
try:
    from fastembed import TextEmbedding
    _model: TextEmbedding | None = TextEmbedding(model_name=settings.embedding_model)
except Exception:
    logger.warning("fastembed model failed to load — embedding disabled", exc_info=True)
    _model = None


def build_embedding_string(schema: dict) -> str:
    """Build a compact text representation of a schema for embedding."""
    top_vars = sorted(
        schema.get("variables") or [],
        key=lambda v: _IMPORTANCE_RANK.get(v.get("importance", "low"), 3),
    )[:3]
    top_risks = sorted(
        schema.get("risks") or [],
        key=lambda r: -float(r.get("severity", 0)),
    )[:2]
    # ConstraintV1 has no description field — use operator/target/value/unit
    constraints = (schema.get("constraints") or [])[:2]
    constraint_strs = [
        f"{c.get('operator', '')} {c.get('target', '')} {c.get('value', '')} {c.get('unit', '') or ''}".strip()
        for c in constraints
    ]
    return (
        f"[{schema.get('decision_category', 'other')}] "
        f"{schema.get('decision', '')} "
        f"Variables: {', '.join(v['name'] for v in top_vars if v.get('name'))}. "
        f"Risks: {', '.join(r['text'][:60] for r in top_risks if r.get('text'))}. "
        f"Constraints: {'; '.join(constraint_strs)}"
    ).strip()


async def embed(text: str) -> list[float]:
    if _model is None:
        return []
    try:
        loop = asyncio.get_running_loop()
        vec = await loop.run_in_executor(None, lambda: next(iter(_model.embed([text]))).tolist())
        return vec
    except Exception:
        logger.warning("embed() failed", exc_info=True)
        return []
