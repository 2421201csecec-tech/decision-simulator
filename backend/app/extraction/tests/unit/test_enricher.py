"""Unit tests: Enricher non-destructive guardrails."""
import copy
import pytest
from unittest.mock import AsyncMock, patch

from app.extraction.enrichment.enricher import Enricher
from app.extraction.enrichment.provenance import EnrichmentAuditRecord


def _base_schema():
    return {
        "decision": "Should we hire a VP of Sales now or wait?",
        "decision_category": "hiring",
        "actions": [
            {"action_id": "a1", "label": "Hire now"},
            {"action_id": "a2", "label": "Wait 6 months"},
        ],
        "variables": [
            {
                "variable_id": "var_revenue",
                "name": "revenue",
                "type": "continuous",
                "importance": "critical",
                "direction": "maximize",
                "range": [0.0, 1.0],
                "default_value": 0.5,
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
                "range": None,       # missing — enrichment should fill
                "default_value": None,
                "source": "inferred",
                "extraction_confidence": 0.6,
                "observability": "lagged",
                "affects": [],
                "enrichment_needed": False,
            },
        ],
        "constraints": [],
        "action_variable_map": {},
    }


def _enriched_response(schema):
    """Simulate what an enrichment LLM response looks like."""
    result = copy.deepcopy(schema)
    # Try to overwrite an explicit field (should be rejected)
    result["variables"][0]["range"] = [0.0, 999.0]
    result["variables"][0]["extraction_confidence"] = 0.5
    # Fill in missing range on inferred variable (should be accepted)
    result["variables"][1]["range"] = [1.0, 12.0]
    result["variables"][1]["default_value"] = 4.0
    # Add action_variable_map
    result["action_variable_map"] = {
        "a1": {"var_revenue": 0.8, "var_hiring_speed": 2.0},
        "a2": {"var_revenue": 0.6, "var_hiring_speed": 6.0},
    }
    return result


@pytest.mark.asyncio
async def test_enricher_never_overwrites_explicit():
    enricher = Enricher()
    schema = _base_schema()
    enriched_json = __import__("json").dumps(_enriched_response(schema))

    with patch(
        "app.extraction.enrichment.enricher.call_llm",
        new=AsyncMock(return_value=(enriched_json, "llama-3.3-70b-versatile", 100, 100)),
    ):
        result, audit = await enricher.enrich(schema, "user input")

    # Explicit field must be unchanged
    assert result["variables"][0]["range"] == [0.0, 1.0]
    assert result["variables"][0]["extraction_confidence"] == 0.9


@pytest.mark.asyncio
async def test_enricher_fills_inferred_fields():
    enricher = Enricher()
    schema = _base_schema()
    enriched_json = __import__("json").dumps(_enriched_response(schema))

    with patch(
        "app.extraction.enrichment.enricher.call_llm",
        new=AsyncMock(return_value=(enriched_json, "llama-3.3-70b-versatile", 100, 100)),
    ):
        result, audit = await enricher.enrich(schema, "user input")

    # Inferred field range was None → should be filled
    assert result["variables"][1]["range"] == [1.0, 12.0]
    assert result["variables"][1]["default_value"] == 4.0


@pytest.mark.asyncio
async def test_enricher_action_variable_map_present():
    enricher = Enricher()
    schema = _base_schema()
    enriched_json = __import__("json").dumps(_enriched_response(schema))

    with patch(
        "app.extraction.enrichment.enricher.call_llm",
        new=AsyncMock(return_value=(enriched_json, "llama-3.3-70b-versatile", 100, 100)),
    ):
        result, _ = await enricher.enrich(schema, "user input")

    assert "action_variable_map" in result
    assert set(result["action_variable_map"].keys()) == {"a1", "a2"}


@pytest.mark.asyncio
async def test_enricher_passthrough_on_llm_failure():
    enricher = Enricher()
    schema = _base_schema()
    original_range = schema["variables"][0]["range"]

    with patch(
        "app.extraction.enrichment.enricher.call_llm",
        new=AsyncMock(side_effect=Exception("LLM unavailable")),
    ):
        result, audit = await enricher.enrich(schema, "user input")

    # Schema must be unchanged
    assert result["variables"][0]["range"] == original_range
    assert audit == []


@pytest.mark.asyncio
async def test_enricher_removes_unknown_action_keys_from_map():
    enricher = Enricher()
    schema = _base_schema()
    bad = copy.deepcopy(_enriched_response(schema))
    bad["action_variable_map"]["a_unknown"] = {"var_revenue": 0.5}
    bad_json = __import__("json").dumps(bad)

    with patch(
        "app.extraction.enrichment.enricher.call_llm",
        new=AsyncMock(return_value=(bad_json, "llama-3.3-70b-versatile", 100, 100)),
    ):
        result, _ = await enricher.enrich(schema, "user input")

    assert "a_unknown" not in result["action_variable_map"]
    assert "a1" in result["action_variable_map"]
