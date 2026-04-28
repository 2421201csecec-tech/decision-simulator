from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.decision_output.generator import generate_decision_output
from app.storage.thread_store import get_decision_output_data

router = APIRouter()


@router.get("/threads/{thread_id}/decision-output")
async def get_decision_output(thread_id: str) -> JSONResponse:
    output = await get_decision_output_data(thread_id)
    if output is None:
        return JSONResponse({"message": "Thread not found"}, status_code=404)
    return JSONResponse({"output": output})


class GenerateVerdictRequest(BaseModel):
    extraction_schema: dict
    pressure_test: dict


@router.post("/decision-output/generate")
async def post_generate_verdict(req: GenerateVerdictRequest) -> JSONResponse:
    output = await generate_decision_output(req.extraction_schema, req.pressure_test)
    if output is None:
        return JSONResponse({"message": "Generation failed"}, status_code=503)
    return JSONResponse(output)
