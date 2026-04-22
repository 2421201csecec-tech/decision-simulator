from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

ThreadStatus = Literal["active", "revision", "failed", "completed"]

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / ".data"
DATA_FILE = DATA_DIR / "threads.json"

EMPTY_STORE: dict[str, list[dict[str, Any]]] = {"threads": []}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(EMPTY_STORE, indent=2), encoding="utf-8")


def _read_store() -> dict[str, list[dict[str, Any]]]:
    _ensure_store()
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return EMPTY_STORE


def _write_store(data: dict[str, list[dict[str, Any]]]) -> None:
    _ensure_store()
    DATA_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_grouped_threads() -> dict[str, list[dict[str, Any]]]:
    data = _read_store()
    grouped: dict[str, list[dict[str, Any]]] = {
        "active": [],
        "revisions": [],
        "failureAnalysis": [],
        "history": [],
    }

    for thread in data["threads"]:
        status = thread.get("status")
        if status == "active":
            grouped["active"].append(thread)
        elif status == "revision":
            grouped["revisions"].append(thread)
        elif status == "failed":
            grouped["failureAnalysis"].append(thread)
        else:
            grouped["history"].append(thread)

    return grouped


def create_thread(payload: dict[str, Any]) -> dict[str, Any]:
    data = _read_store()
    now = _now_iso()

    parent_thread_id = payload.get("parentThreadId")
    status = payload.get("status") or ("revision" if parent_thread_id else "active")
    title = (payload.get("title") or "").strip() or "Untitled Decision"

    thread = {
        "id": str(uuid4()),
        "title": title,
        "status": status,
        "parentThreadId": parent_thread_id,
        "createdAt": now,
        "updatedAt": now,
        "clarifyDraft": {
            "title": title,
            "coreProblem": "",
            "desiredOutcome": "",
            "context": "",
            "constraints": [],
            "assumptions": [],
        },
    }

    data["threads"].insert(0, thread)
    _write_store(data)
    return thread
