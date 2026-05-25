from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.extraction.passes.llm_client import call_llm
from app.extraction.pipeline import run_extraction

logger = logging.getLogger("extraction.api")

router = APIRouter(prefix="/extract", tags=["extraction"])

_PROMPT_DIR = Path(__file__).parent / "prompts"


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


class AnalyzeDraftRequest(BaseModel):
    title: str
    core_problem: str
    context: str = ""
    constraints: list[str] = []
    assumptions: list[str] = []


class AnalyzeDraftResponse(BaseModel):
    suggestions: list[str]
    missing_elements: list[str]
    biases: list[str]


@router.post("/analyze-draft", response_model=AnalyzeDraftResponse)
async def analyze_draft(req: AnalyzeDraftRequest):
    empty = AnalyzeDraftResponse(suggestions=[], missing_elements=[], biases=[])
    total_text = f"{req.title} {req.core_problem}".strip()
    if len(total_text) < 10:
        return empty

    try:
        prompt_path = _PROMPT_DIR / f"analyze_draft_v{settings.prompt_version}.txt"
        template = prompt_path.read_text(encoding="utf-8")
        prompt = template.format(
            title=req.title or "(not provided)",
            core_problem=req.core_problem or "(not provided)",
            context=req.context or "(not provided)",
            constraints=", ".join(req.constraints) if req.constraints else "(none)",
            assumptions=", ".join(req.assumptions) if req.assumptions else "(none)",
        )

        raw, _, _, _ = await call_llm(prompt, temperature=0.3, max_tokens=600, model=settings.llm_fallback_model)

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)
        return AnalyzeDraftResponse(
            suggestions=parsed.get("suggestions", [])[:3],
            missing_elements=parsed.get("missing_elements", [])[:3],
            biases=parsed.get("biases", [])[:2],
        )
    except Exception:
        logger.warning("analyze-draft LLM call failed — returning empty", exc_info=True)
        return empty
