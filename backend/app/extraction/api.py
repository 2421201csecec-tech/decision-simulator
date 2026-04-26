from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.extraction.pipeline import run_extraction

router = APIRouter(prefix="/extract", tags=["extraction"])


class ExtractRequest(BaseModel):
    user_input: str
    session_id: str | None = None
    clarification_answer: str | None = None


@router.post("")
async def extract(req: ExtractRequest):
    result = await run_extraction(
        req.user_input,
        session_id=req.session_id,
        clarification_answer=req.clarification_answer,
    )
    if result.get("status") == "clarification_needed":
        raise HTTPException(status_code=409, detail=result)
    return result
