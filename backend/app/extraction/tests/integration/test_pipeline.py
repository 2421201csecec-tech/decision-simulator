"""Integration tests: full pipeline with mock LLM."""
import json
import pytest
from unittest.mock import AsyncMock, patch

from app.extraction import pipeline as pipeline_module
from app.extraction.pipeline import run_extraction


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_VALID_P1 = {
    "decision": "Should we hire a VP of Sales now or wait 6 months?",
    "decision_category": "hiring",
    "actions": [
        {"action_id": "a1", "label": "Hire now", "is_baseline": False},
        {"action_id": "a2", "label": "Wait 6 months", "is_baseline": True},
    ],
    "actors": ["CEO"],
    "time_horizon": "6 months",
    "constraints": [],
    "success_criteria": [],
}

_VALID_P2 = [
    {
        "variable_id": "var_revenue_growth",
        "name": "revenue growth",
        "type": "continuous",
        "importance": "critical",
        "direction": "maximize",
        "range": [0.0, 0.5],
        "default_value": 0.15,
        "source": "explicit",
        "extraction_confidence": 0.9,
        "observability": "lagged",
        "affects": [],
        "enrichment_needed": False,
    },
    {
        "variable_id": "var_hiring_speed",
        "name": "hiring speed",
        "type": "continuous",
        "importance": "high",
        "direction": "maximize",
        "range": [1.0, 12.0],
        "default_value": 4.0,
        "source": "inferred",
        "extraction_confidence": 0.75,
        "observability": "lagged",
        "affects": [],
        "enrichment_needed": False,
    },
    {
        "variable_id": "var_burn_rate",
        "name": "burn rate",
        "type": "continuous",
        "importance": "medium",
        "direction": "minimize",
        "range": [0.5, 2.0],
        "default_value": 1.0,
        "source": "inferred",
        "extraction_confidence": 0.8,
        "observability": "lagged",
        "affects": [],
        "enrichment_needed": False,
    },
]

_VALID_P3 = {
    "assumptions": [
        {"assumption_id": "asm_1", "text": "Hiring takes 4 weeks", "fragility": 0.7, "variable_ids": []},
    ],
    "risks": [
        {"risk_id": "risk_1", "text": "VP may not ramp fast enough", "severity": 0.6, "probability": 0.4, "variable_ids": []},
    ],
    "hidden_deps": ["Board approval may be needed for exec hire"],
    "known_unknowns": ["Current pipeline conversion rate"],
}

_ENRICHED = {
    **_VALID_P1,
    "variables": _VALID_P2,
    **_VALID_P3,
    "action_variable_map": {
        "a1": {"var_revenue_growth": 0.25, "var_hiring_speed": 2.0},
        "a2": {"var_revenue_growth": 0.15, "var_hiring_speed": 6.0},
    },
}


def _mock_passes(p1=_VALID_P1, p2=_VALID_P2, p3=_VALID_P3, enriched=None):
    """Return mock coroutines for all three passes + enricher."""
    async def mock_pass1(*args, **kwargs):
        return p1

    async def mock_pass2(*args, **kwargs):
        return p2

    async def mock_pass3(*args, **kwargs):
        return p3

    async def mock_enrich(self, schema, user_input, memory_schemas=None):
        return enriched or {**schema, "action_variable_map": {
            "a1": {"var_revenue_growth": 0.25},
            "a2": {"var_revenue_growth": 0.15},
        }}, []

    return mock_pass1, mock_pass2, mock_pass3, mock_enrich


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_pipeline_succeeds():
    p1, p2, p3, enrich = _mock_passes()
    with (
        patch("app.extraction.pipeline.run_pass1", new=p1),
        patch("app.extraction.pipeline.run_pass2", new=p2),
        patch("app.extraction.pipeline.run_pass3", new=p3),
        patch.object(pipeline_module.Enricher, "enrich", new=enrich),
    ):
        result = await run_extraction("Should we hire a VP of Sales?")

    assert result.get("status") != "clarification_needed"
    assert result["decision"] == _VALID_P1["decision"]
    assert "variables" in result
    assert "consistency_report" in result
    assert "confidence" in result
    assert "validation" in result
    assert result["validation"]["hard_passed"] is True


@pytest.mark.asyncio
async def test_pipeline_409_on_persistent_hard_failure():
    """If pass 1 always returns a schema with missing decision, pipeline returns 409."""
    bad_p1 = {**_VALID_P1, "decision": ""}  # V001 will always fail

    async def always_bad_pass1(*args, **kwargs):
        return bad_p1

    p1, p2, p3, enrich = _mock_passes(p1=bad_p1)
    with (
        patch("app.extraction.pipeline.run_pass1", new=always_bad_pass1),
        patch("app.extraction.pipeline.run_pass2", new=p2),
        patch("app.extraction.pipeline.run_pass3", new=p3),
        patch.object(pipeline_module.Enricher, "enrich", new=enrich),
    ):
        result = await run_extraction("vague input")

    assert result["status"] == "clarification_needed"
    assert "clarification_question" in result
    assert "session_id" in result
    assert len(result["session_id"]) > 0


@pytest.mark.asyncio
async def test_pipeline_clarification_question_uses_template():
    """The clarification question should match the V001 template."""
    bad_p1 = {**_VALID_P1, "decision": ""}

    async def always_bad_pass1(*args, **kwargs):
        return bad_p1

    p1, p2, p3, enrich = _mock_passes(p1=bad_p1)
    with (
        patch("app.extraction.pipeline.run_pass1", new=always_bad_pass1),
        patch("app.extraction.pipeline.run_pass2", new=p2),
        patch("app.extraction.pipeline.run_pass3", new=p3),
        patch.object(pipeline_module.Enricher, "enrich", new=enrich),
    ):
        result = await run_extraction("vague input")

    # V001 template
    assert "one sentence" in result["clarification_question"].lower()


@pytest.mark.asyncio
async def test_pipeline_resumes_from_session():
    """Second call with session_id + answer succeeds."""
    bad_p1 = {**_VALID_P1, "decision": ""}
    call_count = {"n": 0}

    async def pass1_fails_then_succeeds(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] <= 3:  # first extraction (max_retries+1 attempts)
            return bad_p1
        return _VALID_P1   # resume call succeeds

    p1, p2, p3, enrich = _mock_passes()
    with (
        patch("app.extraction.pipeline.run_pass1", new=pass1_fails_then_succeeds),
        patch("app.extraction.pipeline.run_pass2", new=p2),
        patch("app.extraction.pipeline.run_pass3", new=p3),
        patch.object(pipeline_module.Enricher, "enrich", new=enrich),
    ):
        first = await run_extraction("vague input")
        assert first["status"] == "clarification_needed"
        sid = first["session_id"]

        second = await run_extraction(
            "vague input",
            session_id=sid,
            clarification_answer="Deciding whether to hire a VP of Sales now.",
        )

    assert second.get("status") != "clarification_needed"
    assert "decision" in second


@pytest.mark.asyncio
async def test_pipeline_consistency_report_attached():
    p1, p2, p3, enrich = _mock_passes()
    with (
        patch("app.extraction.pipeline.run_pass1", new=p1),
        patch("app.extraction.pipeline.run_pass2", new=p2),
        patch("app.extraction.pipeline.run_pass3", new=p3),
        patch.object(pipeline_module.Enricher, "enrich", new=enrich),
    ):
        result = await run_extraction("Should we hire?")

    cr = result["consistency_report"]
    assert "cycles" in cr
    assert "temporal_warnings" in cr
    assert "constraint_conflicts" in cr
    assert "overall_score" in cr
    assert cr["overall_score"] == 1.0  # clean schema


@pytest.mark.asyncio
async def test_pipeline_confidence_present_and_valid():
    p1, p2, p3, enrich = _mock_passes()
    with (
        patch("app.extraction.pipeline.run_pass1", new=p1),
        patch("app.extraction.pipeline.run_pass2", new=p2),
        patch("app.extraction.pipeline.run_pass3", new=p3),
        patch.object(pipeline_module.Enricher, "enrich", new=enrich),
    ):
        result = await run_extraction("Should we hire?")

    conf = result["confidence"]
    assert 0.0 <= conf["overall_confidence"] <= 1.0
    assert all(k in conf for k in (
        "evidence_strength", "type_clarity", "range_clarity",
        "dependency_clarity", "constraint_alignment",
    ))
