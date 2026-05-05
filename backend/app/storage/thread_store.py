"""
Service / orchestration layer between route handlers and the DB repository.

Route handlers import from here — never directly from thread_repository.
As each engine is integrated, orchestration logic (Celery dispatch, cross-table
reads, pattern profile updates) is added here. thread_repository stays as
pure async DB operations.
"""
from __future__ import annotations

from typing import Any, Literal

from app.storage.thread_repository import (
    create_thread as _create_thread,
    get_grouped_threads as _get_grouped_threads,
    get_thread_by_id as _get_thread_by_id,
    get_thread_context_data as _get_thread_context_data,
    save_clarify_draft as _save_clarify_draft,
    generate_pressure_test as _generate_pressure_test,
    get_pressure_test as _get_pressure_test,
    submit_pressure_answer as _submit_pressure_answer,
    skip_pressure_scenario as _skip_pressure_scenario,
    run_simulation as _run_simulation,
    get_latest_simulation as _get_latest_simulation,
    get_simulation_history as _get_simulation_history,
    get_extraction_schema as _get_extraction_schema,
    get_decision_output_data as _get_decision_output_data,
    get_failure_analysis as _get_failure_analysis,
    save_failure_analysis as _save_failure_analysis,
    get_pattern_profile as _get_pattern_profile,
    get_weak_spots as _get_weak_spots,
    get_thread_export_data as _get_thread_export_data,
    get_all_threads_export_data as _get_all_threads_export_data,
)

ThreadStatus = Literal["active", "revision", "failed", "completed"]


async def get_grouped_threads() -> dict[str, list[dict[str, Any]]]:
    return await _get_grouped_threads()


async def create_thread(payload: dict[str, Any]) -> dict[str, Any]:
    return await _create_thread(payload)


async def get_thread_by_id(thread_id: str) -> dict[str, Any] | None:
    return await _get_thread_by_id(thread_id)


async def get_thread_context_data(thread_id: str) -> dict[str, Any] | None:
    return await _get_thread_context_data(thread_id)


async def save_clarify_draft(thread_id: str, draft: dict[str, Any]) -> dict[str, Any] | None:
    return await _save_clarify_draft(thread_id, draft)


async def generate_pressure_test(thread_id: str) -> dict[str, Any] | None:
    return await _generate_pressure_test(thread_id)


async def get_pressure_test(thread_id: str) -> dict[str, Any] | None:
    return await _get_pressure_test(thread_id)


async def submit_pressure_answer(
    thread_id: str, scenario_id: int, answer: str, probe_id: str | None = None
) -> dict[str, Any] | None:
    return await _submit_pressure_answer(thread_id, scenario_id, answer, probe_id)


async def skip_pressure_scenario(
    thread_id: str, scenario_id: int, probe_id: str | None = None
) -> dict[str, Any] | None:
    return await _skip_pressure_scenario(thread_id, scenario_id, probe_id)


async def run_simulation(thread_id: str, variables: dict[str, Any]) -> dict[str, Any] | None:
    return await _run_simulation(thread_id, variables)


async def get_latest_simulation(thread_id: str) -> dict[str, Any] | None:
    return await _get_latest_simulation(thread_id)


async def get_extraction_schema(thread_id: str) -> dict[str, Any] | None:
    return await _get_extraction_schema(thread_id)


async def get_simulation_history(thread_id: str) -> list[dict[str, Any]] | None:
    return await _get_simulation_history(thread_id)


async def get_decision_output_data(thread_id: str) -> dict[str, Any] | None:
    return await _get_decision_output_data(thread_id)


async def get_failure_analysis(thread_id: str) -> dict[str, Any] | None:
    return await _get_failure_analysis(thread_id)


async def save_failure_analysis(thread_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    return await _save_failure_analysis(thread_id, payload)


async def get_pattern_profile(user_id: str) -> dict[str, Any]:
    return await _get_pattern_profile(user_id)


async def get_weak_spots(user_id: str) -> list[dict]:
    return await _get_weak_spots(user_id)


async def get_thread_export_data(thread_id: str) -> dict[str, Any] | None:
    return await _get_thread_export_data(thread_id)


async def get_all_threads_export_data() -> list[dict[str, Any]]:
    return await _get_all_threads_export_data()
