"""Unit tests: one test per validation rule V001–V018."""
import copy
import pytest

from app.extraction.validation.rules import (
    V001_decision_nonempty,
    V002_actions_count,
    V003_actions_have_required_fields,
    V004_decision_category_valid,
    V005_variables_count,
    V006_continuous_range_valid,
    V007_affects_references_valid_ids,
    V008_confidence_in_range,
    V009_broken_affects_edge_soft,
    V010_dag_acyclic,
    V011_default_value_in_domain,
    V012_direction_on_important_vars,
    V013_time_horizon_nonempty,
    V014_low_confidence_needs_enrichment,
    V015_action_variable_map_keys_match,
    V016_constraint_targets_valid,
    V017_boolean_has_no_range,
    V018_no_contradictory_hard_constraints,
)
from app.extraction.validation.validator import SchemaValidator


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _base_schema():
    """Minimal valid schema that passes all rules."""
    return {
        "decision": "Should we hire a VP of Sales now or wait 6 months?",
        "decision_category": "hiring",
        "actions": [
            {"action_id": "a1", "label": "Hire now", "is_baseline": False},
            {"action_id": "a2", "label": "Wait 6 months", "is_baseline": True},
        ],
        "time_horizon": "6 months",
        "constraints": [],
        "action_variable_map": {},
        "variables": [
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
        ],
    }


# ---------------------------------------------------------------------------
# V001
# ---------------------------------------------------------------------------

def test_V001_passes_with_decision():
    assert V001_decision_nonempty(_base_schema()).passed is True


def test_V001_fails_on_empty_decision():
    s = _base_schema()
    s["decision"] = "   "
    r = V001_decision_nonempty(s)
    assert r.passed is False
    assert r.rule_id == "V001"
    assert r.re_run_pass == 1


def test_V001_fails_on_missing_decision():
    s = _base_schema()
    del s["decision"]
    assert V001_decision_nonempty(s).passed is False


# ---------------------------------------------------------------------------
# V002
# ---------------------------------------------------------------------------

def test_V002_passes_with_two_actions():
    assert V002_actions_count(_base_schema()).passed is True


def test_V002_fails_with_one_action():
    s = _base_schema()
    s["actions"] = [{"action_id": "a1", "label": "Only option"}]
    assert V002_actions_count(s).passed is False


def test_V002_fails_with_seven_actions():
    s = _base_schema()
    s["actions"] = [{"action_id": f"a{i}", "label": f"Option {i}"} for i in range(7)]
    assert V002_actions_count(s).passed is False


# ---------------------------------------------------------------------------
# V003
# ---------------------------------------------------------------------------

def test_V003_passes_with_valid_actions():
    assert V003_actions_have_required_fields(_base_schema()).passed is True


def test_V003_fails_missing_action_id():
    s = _base_schema()
    s["actions"][0] = {"label": "No ID"}
    assert V003_actions_have_required_fields(s).passed is False


def test_V003_fails_empty_label():
    s = _base_schema()
    s["actions"][0] = {"action_id": "a1", "label": ""}
    assert V003_actions_have_required_fields(s).passed is False


# ---------------------------------------------------------------------------
# V004
# ---------------------------------------------------------------------------

def test_V004_passes_valid_category():
    assert V004_decision_category_valid(_base_schema()).passed is True


def test_V004_fails_invalid_category():
    s = _base_schema()
    s["decision_category"] = "personal"
    r = V004_decision_category_valid(s)
    assert r.passed is False
    assert r.re_run_pass == 1


# ---------------------------------------------------------------------------
# V005
# ---------------------------------------------------------------------------

def test_V005_passes_with_three_variables():
    assert V005_variables_count(_base_schema()).passed is True


def test_V005_fails_too_few():
    s = _base_schema()
    s["variables"] = s["variables"][:2]
    assert V005_variables_count(s).passed is False


def test_V005_fails_too_many():
    s = _base_schema()
    base_var = copy.deepcopy(s["variables"][0])
    s["variables"] = []
    for i in range(16):
        v = copy.deepcopy(base_var)
        v["variable_id"] = f"var_{i}"
        v["name"] = f"var {i}"
        s["variables"].append(v)
    assert V005_variables_count(s).passed is False


# ---------------------------------------------------------------------------
# V006
# ---------------------------------------------------------------------------

def test_V006_passes_valid_ranges():
    assert V006_continuous_range_valid(_base_schema()).passed is True


def test_V006_fails_inverted_range():
    s = _base_schema()
    s["variables"][0]["range"] = [1.0, 0.0]
    assert V006_continuous_range_valid(s).passed is False


def test_V006_fails_equal_range():
    s = _base_schema()
    s["variables"][0]["range"] = [0.5, 0.5]
    assert V006_continuous_range_valid(s).passed is False


def test_V006_ignores_boolean_type():
    s = _base_schema()
    s["variables"][0]["type"] = "boolean"
    s["variables"][0]["range"] = None
    assert V006_continuous_range_valid(s).passed is True


# ---------------------------------------------------------------------------
# V007
# ---------------------------------------------------------------------------

def test_V007_passes_valid_affects():
    s = _base_schema()
    s["variables"][0]["affects"] = ["var_hiring_speed"]
    assert V007_affects_references_valid_ids(s).passed is True


def test_V007_fails_unknown_variable_id():
    s = _base_schema()
    s["variables"][0]["affects"] = ["var_nonexistent"]
    assert V007_affects_references_valid_ids(s).passed is False


# ---------------------------------------------------------------------------
# V008
# ---------------------------------------------------------------------------

def test_V008_passes_valid_confidence():
    assert V008_confidence_in_range(_base_schema()).passed is True


def test_V008_fails_confidence_above_one():
    s = _base_schema()
    s["variables"][0]["extraction_confidence"] = 1.1
    assert V008_confidence_in_range(s).passed is False


def test_V008_fails_negative_confidence():
    s = _base_schema()
    s["variables"][0]["extraction_confidence"] = -0.1
    assert V008_confidence_in_range(s).passed is False


# ---------------------------------------------------------------------------
# V009 (SOFT)
# ---------------------------------------------------------------------------

def test_V009_passes_no_broken_edges():
    assert V009_broken_affects_edge_soft(_base_schema()).passed is True


def test_V009_soft_fixes_broken_edge_on_low_importance():
    s = _base_schema()
    s["variables"][2]["importance"] = "low"
    s["variables"][2]["affects"] = ["var_nonexistent"]
    r = V009_broken_affects_edge_soft(s)
    assert r.passed is False
    assert r.rule_id == "V009"
    assert "var_nonexistent" not in r.repaired_schema["variables"][2]["affects"]


def test_V009_does_not_fix_high_importance():
    """High importance broken edges are left for V007 (HARD) to catch."""
    s = _base_schema()
    s["variables"][0]["importance"] = "high"
    s["variables"][0]["affects"] = ["var_nonexistent"]
    r = V009_broken_affects_edge_soft(s)
    assert r.passed is True  # V009 skips high importance


# ---------------------------------------------------------------------------
# V010
# ---------------------------------------------------------------------------

def test_V010_passes_acyclic_dag():
    s = _base_schema()
    s["variables"][0]["affects"] = ["var_hiring_speed"]
    assert V010_dag_acyclic(s).passed is True


def test_V010_fails_cycle():
    s = _base_schema()
    s["variables"][0]["affects"] = ["var_hiring_speed"]
    s["variables"][1]["affects"] = ["var_revenue_growth"]
    r = V010_dag_acyclic(s)
    assert r.passed is False
    assert r.rule_id == "V010"
    assert r.re_run_pass == 2


# ---------------------------------------------------------------------------
# V011 (SOFT)
# ---------------------------------------------------------------------------

def test_V011_passes_when_default_in_range():
    assert V011_default_value_in_domain(_base_schema()).passed is True


def test_V011_clamps_out_of_range_default():
    s = _base_schema()
    s["variables"][0]["default_value"] = 5.0  # range is [0.0, 0.5]
    r = V011_default_value_in_domain(s)
    assert r.passed is False
    assert r.repaired_schema["variables"][0]["default_value"] == 0.25  # midpoint


def test_V011_passes_when_no_default():
    s = _base_schema()
    s["variables"][0]["default_value"] = None
    assert V011_default_value_in_domain(s).passed is True


# ---------------------------------------------------------------------------
# V012
# ---------------------------------------------------------------------------

def test_V012_passes_direction_set_on_important():
    assert V012_direction_on_important_vars(_base_schema()).passed is True


def test_V012_fails_missing_direction_on_critical():
    s = _base_schema()
    s["variables"][0]["direction"] = None
    assert V012_direction_on_important_vars(s).passed is False


def test_V012_passes_missing_direction_on_medium():
    s = _base_schema()
    s["variables"][2]["importance"] = "medium"
    s["variables"][2]["direction"] = None
    assert V012_direction_on_important_vars(s).passed is True


# ---------------------------------------------------------------------------
# V013
# ---------------------------------------------------------------------------

def test_V013_passes_with_time_horizon():
    assert V013_time_horizon_nonempty(_base_schema()).passed is True


def test_V013_fails_empty_time_horizon():
    s = _base_schema()
    s["time_horizon"] = ""
    assert V013_time_horizon_nonempty(s).passed is False


# ---------------------------------------------------------------------------
# V014 (SOFT)
# ---------------------------------------------------------------------------

def test_V014_passes_no_low_confidence():
    assert V014_low_confidence_needs_enrichment(_base_schema()).passed is True


def test_V014_flags_low_confidence_var():
    s = _base_schema()
    s["variables"][0]["extraction_confidence"] = 0.4
    r = V014_low_confidence_needs_enrichment(s)
    assert r.passed is False
    assert r.repaired_schema["variables"][0]["enrichment_needed"] is True


def test_V014_does_not_double_flag():
    s = _base_schema()
    s["variables"][0]["extraction_confidence"] = 0.4
    s["variables"][0]["enrichment_needed"] = True  # already flagged
    assert V014_low_confidence_needs_enrichment(s).passed is True


# ---------------------------------------------------------------------------
# V015
# ---------------------------------------------------------------------------

def test_V015_passes_empty_action_variable_map():
    assert V015_action_variable_map_keys_match(_base_schema()).passed is True


def test_V015_passes_matching_keys():
    s = _base_schema()
    s["action_variable_map"] = {"a1": {}, "a2": {}}
    assert V015_action_variable_map_keys_match(s).passed is True


def test_V015_fails_unknown_action_key():
    s = _base_schema()
    s["action_variable_map"] = {"a1": {}, "a99": {}}
    assert V015_action_variable_map_keys_match(s).passed is False


# ---------------------------------------------------------------------------
# V016
# ---------------------------------------------------------------------------

def test_V016_passes_empty_constraints():
    assert V016_constraint_targets_valid(_base_schema()).passed is True


def test_V016_passes_valid_constraint_target():
    s = _base_schema()
    s["constraints"] = [{"constraint_id": "c1", "operator": ">=", "target": "var_revenue_growth", "value": 0.1, "is_hard": True, "type": "numeric"}]
    assert V016_constraint_targets_valid(s).passed is True


def test_V016_fails_unknown_constraint_target():
    s = _base_schema()
    s["constraints"] = [{"constraint_id": "c1", "operator": ">=", "target": "var_unknown", "value": 0.1, "is_hard": True, "type": "numeric"}]
    assert V016_constraint_targets_valid(s).passed is False


# ---------------------------------------------------------------------------
# V017
# ---------------------------------------------------------------------------

def test_V017_passes_no_boolean_with_range():
    assert V017_boolean_has_no_range(_base_schema()).passed is True


def test_V017_fails_boolean_with_range():
    s = _base_schema()
    s["variables"][0]["type"] = "boolean"
    s["variables"][0]["range"] = [0, 1]
    assert V017_boolean_has_no_range(s).passed is False


def test_V017_passes_boolean_without_range():
    s = _base_schema()
    s["variables"][0]["type"] = "boolean"
    s["variables"][0]["range"] = None
    assert V017_boolean_has_no_range(s).passed is True


# ---------------------------------------------------------------------------
# V018
# ---------------------------------------------------------------------------

def test_V018_passes_no_constraints():
    assert V018_no_contradictory_hard_constraints(_base_schema()).passed is True


def test_V018_passes_non_contradicting_constraints():
    s = _base_schema()
    s["constraints"] = [
        {"constraint_id": "c1", "operator": ">=", "target": "var_revenue_growth", "value": 0.1, "is_hard": True, "type": "numeric"},
        {"constraint_id": "c2", "operator": "<=", "target": "var_revenue_growth", "value": 0.5, "is_hard": True, "type": "numeric"},
    ]
    assert V018_no_contradictory_hard_constraints(s).passed is True


def test_V018_fails_contradicting_constraints():
    s = _base_schema()
    s["constraints"] = [
        {"constraint_id": "c1", "operator": ">=", "target": "var_revenue_growth", "value": 0.4, "is_hard": True, "type": "numeric"},
        {"constraint_id": "c2", "operator": "<=", "target": "var_revenue_growth", "value": 0.2, "is_hard": True, "type": "numeric"},
    ]
    r = V018_no_contradictory_hard_constraints(s)
    assert r.passed is False
    assert r.rule_id == "V018"


# ---------------------------------------------------------------------------
# SchemaValidator integration
# ---------------------------------------------------------------------------

def test_validator_passes_valid_schema():
    v = SchemaValidator()
    result = v.validate(_base_schema())
    assert result.passed is True
    assert result.hard_errors == []


def test_validator_collects_all_hard_errors():
    """All hard failures must be collected in one pass — no short-circuit."""
    s = _base_schema()
    s["decision"] = ""           # V001 fail
    s["decision_category"] = "invalid"  # V004 fail
    s["time_horizon"] = ""       # V013 fail
    v = SchemaValidator()
    result = v.validate(s)
    assert result.passed is False
    rule_ids = {e["rule_id"] for e in result.hard_errors}
    assert "V001" in rule_ids
    assert "V004" in rule_ids
    assert "V013" in rule_ids


def test_validator_applies_soft_fix_and_passes():
    s = _base_schema()
    s["variables"][0]["default_value"] = 5.0  # out of range [0.0, 0.5]
    v = SchemaValidator()
    result = v.validate(s)
    assert result.passed is True  # hard rules all pass
    assert len(result.soft_fixes) >= 1
    assert result.schema["variables"][0]["default_value"] == 0.25


def test_validator_get_error_context():
    s = _base_schema()
    s["decision"] = ""
    v = SchemaValidator()
    result = v.validate(s)
    ctx = v.get_error_context(result)
    assert "V001" in ctx
    assert "PREVIOUS ATTEMPT" in ctx


def test_validator_get_passes_to_rerun():
    s = _base_schema()
    s["decision"] = ""           # V001 → re_run_pass=1
    s["variables"] = s["variables"][:2]  # V005 → re_run_pass=2
    v = SchemaValidator()
    result = v.validate(s)
    passes = v.get_passes_to_rerun(result)
    assert 1 in passes
    assert 2 in passes
