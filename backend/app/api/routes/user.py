from __future__ import annotations
import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from app.db.engine import get_async_session
from app.models.decision import AggregatePattern, Decision, PatternContributionLog, PatternInstance, PatternProfile
from app.config import settings

logger = logging.getLogger("routes.user")
router = APIRouter()


@router.delete("/user/threads")
async def delete_all_threads(request: Request) -> JSONResponse:
    user_id = request.state.user_id
    async with get_async_session() as session:
        await session.execute(delete(PatternInstance).where(PatternInstance.user_id == user_id))
        await session.execute(delete(PatternContributionLog).where(PatternContributionLog.user_id == user_id))
        await session.execute(delete(AggregatePattern).where(AggregatePattern.user_id == user_id))
        result = await session.execute(delete(Decision).where(Decision.user_id == user_id))
        await session.commit()
        return JSONResponse({"deleted": result.rowcount})


@router.delete("/user/account")
async def delete_account(request: Request) -> JSONResponse:
    user_id = request.state.user_id
    async with get_async_session() as session:
        await session.execute(delete(PatternInstance).where(PatternInstance.user_id == user_id))
        await session.execute(delete(PatternContributionLog).where(PatternContributionLog.user_id == user_id))
        await session.execute(delete(AggregatePattern).where(AggregatePattern.user_id == user_id))
        await session.execute(delete(PatternProfile).where(PatternProfile.user_id == user_id))
        await session.execute(delete(Decision).where(Decision.user_id == user_id))
        await session.commit()

    if settings.supabase_url and settings.supabase_service_role_key:
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
                    headers={
                        "apikey": settings.supabase_service_role_key,
                        "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    },
                    timeout=10,
                )
        except Exception:
            logger.warning("Supabase admin user deletion failed — data already wiped", exc_info=True)

    return JSONResponse({"deleted": True})


@router.get("/user/thinking-patterns")
async def get_thinking_patterns(request: Request) -> JSONResponse:
    user_id = request.state.user_id
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternProfile.themes).where(PatternProfile.user_id == user_id)
        )
        row = result.first()

    if not row or not row[0]:
        return JSONResponse({"patterns": []})

    themes: list[dict] = list(row[0])
    active = [t for t in themes if float(t.get("confidence", 0)) > 0.15]
    active.sort(key=lambda t: float(t.get("confidence", 0)), reverse=True)

    patterns = [
        {
            "slug": t.get("pattern_type", t.get("slug", "")),
            "name": t.get("pattern_type", t.get("name", "")),
            "statement": t.get("statement", ""),
            "confidence": float(t.get("confidence", 0)),
            "count": int(t.get("count", 1)),
            "last_seen": t.get("last_seen"),
        }
        for t in active
    ]
    return JSONResponse({"patterns": patterns})


@router.get("/user/decision-patterns")
async def get_decision_patterns(request: Request) -> JSONResponse:
    user_id = request.state.user_id
    async with get_async_session() as session:
        decisions_result = await session.execute(
            select(Decision.decision_id, Decision.title, Decision.created_at)
            .where(Decision.user_id == user_id)
            .order_by(Decision.created_at.desc())
        )
        decisions = decisions_result.all()

        patterns_result = await session.execute(
            select(PatternInstance.decision_id, PatternInstance.slug)
            .where(PatternInstance.user_id == user_id)
        )
        pattern_rows = patterns_result.all()

    pattern_map: dict[str, set[str]] = {}
    for row in pattern_rows:
        pattern_map.setdefault(row.decision_id, set()).add(row.slug)

    result = [
        {
            "decision_id": d.decision_id,
            "title": d.title or "Untitled Decision",
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "patterns": sorted(pattern_map.get(d.decision_id, set())),
        }
        for d in decisions
        if pattern_map.get(d.decision_id)
    ]
    return JSONResponse({"decisions": result})


@router.get("/user/thinking-patterns/{slug}/evidence")
async def get_pattern_evidence(request: Request, slug: str) -> JSONResponse:
    user_id = request.state.user_id
    async with get_async_session() as session:
        result = await session.execute(
            select(PatternInstance)
            .where(PatternInstance.user_id == user_id, PatternInstance.slug == slug)
            .order_by(PatternInstance.created_at.desc())
            .limit(50)
        )
        instances = result.scalars().all()

    by_decision: dict[str, list[dict]] = {}
    for inst in instances:
        entry = {
            "statement": inst.statement,
            "raw_text": inst.raw_text,
            "field_type": inst.field_type,
            "source": inst.source,
            "created_at": inst.created_at.isoformat() if inst.created_at else None,
        }
        by_decision.setdefault(inst.decision_id, []).append(entry)

    evidence = [{"decision_id": did, "instances": items} for did, items in by_decision.items()]
    return JSONResponse({"slug": slug, "evidence": evidence})
