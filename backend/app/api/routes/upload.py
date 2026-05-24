from __future__ import annotations

import io
import logging

from fastapi import APIRouter, Request, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from app.storage.thread_repository import get_thread_by_id, patch_clarify_draft_field

logger = logging.getLogger("routes.upload")

router = APIRouter()

MAX_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_EXTRACT_CHARS = 8_000      # cap injected into prompts


def _extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()

    if name.endswith(".pdf"):
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                pages = [p.extract_text() or "" for p in pdf.pages]
            return "\n".join(pages).strip()
        except Exception as e:
            logger.warning("PDF extraction failed: %s", e)
            raise HTTPException(status_code=422, detail="Could not extract text from PDF.")

    if name.endswith((".doc", ".docx")):
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            logger.warning("DOCX extraction failed: %s", e)
            raise HTTPException(status_code=422, detail="Could not extract text from document.")

    if name.endswith((".txt", ".csv", ".md")):
        try:
            return data.decode("utf-8", errors="replace").strip()
        except Exception:
            raise HTTPException(status_code=422, detail="Could not read text file.")

    raise HTTPException(status_code=415, detail=f"Unsupported file type: {filename}")


@router.post("/threads/{thread_id}/upload")
async def upload_document(
    request: Request,
    thread_id: str,
    file: UploadFile = File(...),
):
    user_id = request.state.user_id

    thread = await get_thread_by_id(thread_id, user_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    extracted = _extract_text(file.filename or "", data)
    if not extracted:
        raise HTTPException(status_code=422, detail="No text could be extracted from the file.")

    # Cap to avoid bloating prompts
    trimmed = extracted[:MAX_EXTRACT_CHARS]
    if len(extracted) > MAX_EXTRACT_CHARS:
        trimmed += "\n[...document truncated for processing...]"

    await patch_clarify_draft_field(thread_id, user_id, "uploaded_context", trimmed)

    logger.info("upload: thread=%s file=%s chars=%d", thread_id, file.filename, len(trimmed))
    return JSONResponse({"filename": file.filename, "chars": len(trimmed)})
