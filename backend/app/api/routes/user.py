from __future__ import annotations
import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete
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
