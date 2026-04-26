"""Unit tests: DAG builder, cycle detection, temporal consistency, constraint feasibility."""
import pytest

from app.extraction.consistency.dag import (
    build_dag,
    check_cycles,
    check_temporal_consistency,
)
from app.extraction.consistency.checker import (
    check_constraint_feasibility,
    run_checks,
)
from app.extraction.schemas import ConsistencyReport


def _var(vid, observability="lagged", affects=None):
    return {
        "variable_id": vid,
        "name": vid,
        "observability": observability,
        "affects": affects or [],
    }


# ---------------------------------------------------------------------------
# build_dag
# ---------------------------------------------------------------------------

def test_build_dag_creates_nodes_and_edges():
    variables = [
        _var("var_a", affects=["var_b"]),
        _var("var_b", affects=["var_c"]),
        _var("var_c"),
    ]
    G = build_dag(variables)
    assert set(G.nodes) == {"var_a", "var_b", "var_c"}
    assert G.has_edge("var_a", "var_b")
    assert G.has_edge("var_b", "var_c")
    assert not G.has_edge("var_a", "var_c")


def test_build_dag_skips_vars_without_id():
    variables = [{"name": "no_id", "affects": []}, _var("var_a")]
    G = build_dag(variables)
    assert "var_a" in G.nodes
    assert "no_id" not in G.nodes


# ---------------------------------------------------------------------------
# check_cycles
# ---------------------------------------------------------------------------

def test_check_cycles_returns_empty_for_acyclic():
    variables = [
        _var("var_a", affects=["var_b"]),
        _var("var_b", affects=["var_c"]),
        _var("var_c"),
    ]
    G = build_dag(variables)
    assert check_cycles(G) == []


def test_check_cycles_detects_simple_cycle():
    variables = [
        _var("var_a", affects=["var_b"]),
        _var("var_b", affects=["var_a"]),
    ]
    G = build_dag(variables)
    cycles = check_cycles(G)
    assert len(cycles) == 1
    assert set(cycles[0]) == {"var_a", "var_b"}


def test_check_cycles_detects_three_node_cycle():
    variables = [
        _var("var_a", affects=["var_b"]),
        _var("var_b", affects=["var_c"]),
        _var("var_c", affects=["var_a"]),
    ]
    G = build_dag(variables)
    cycles = check_cycles(G)
    assert len(cycles) >= 1


def test_check_cycles_no_false_positive_with_diamond():
    # A→B, A→C, B→D, C→D — diamond DAG, no cycle
    variables = [
        _var("var_a", affects=["var_b", "var_c"]),
        _var("var_b", affects=["var_d"]),
        _var("var_c", affects=["var_d"]),
        _var("var_d"),
    ]
    G = build_dag(variables)
    assert check_cycles(G) == []


# ---------------------------------------------------------------------------
# check_temporal_consistency
# ---------------------------------------------------------------------------

def test_temporal_ok_realtime_affects_lagged():
    variables = [
        _var("var_a", observability="realtime", affects=["var_b"]),
        _var("var_b", observability="lagged"),
    ]
    G = build_dag(variables)
    assert check_temporal_consistency(G, variables) == []


def test_temporal_ok_lagged_affects_terminal():
    variables = [
        _var("var_a", observability="lagged", affects=["var_b"]),
        _var("var_b", observability="terminal"),
    ]
    G = build_dag(variables)
    assert check_temporal_consistency(G, variables) == []


def test_temporal_inconsistency_terminal_affects_realtime():
    variables = [
        _var("var_a", observability="terminal", affects=["var_b"]),
        _var("var_b", observability="realtime"),
    ]
    G = build_dag(variables)
    warnings = check_temporal_consistency(G, variables)
    assert len(warnings) == 1
    assert "var_a" in warnings[0]
    assert "var_b" in warnings[0]


# ---------------------------------------------------------------------------
# check_constraint_feasibility
# ---------------------------------------------------------------------------

def test_constraint_feasibility_ok_non_overlapping():
    constraints = [
        {"constraint_id": "c1", "operator": ">=", "target": "var_x", "value": 0.1, "is_hard": True, "type": "numeric"},
        {"constraint_id": "c2", "operator": "<=", "target": "var_x", "value": 0.5, "is_hard": True, "type": "numeric"},
    ]
    assert check_constraint_feasibility(constraints, []) == []


def test_constraint_feasibility_contradicts_gte_lte():
    constraints = [
        {"constraint_id": "c1", "operator": ">=", "target": "var_x", "value": 0.4, "is_hard": True, "type": "numeric"},
        {"constraint_id": "c2", "operator": "<=", "target": "var_x", "value": 0.2, "is_hard": True, "type": "numeric"},
    ]
    issues = check_constraint_feasibility(constraints, [])
    assert len(issues) == 1
    assert "var_x" in issues[0]


def test_constraint_feasibility_contradicts_lte_gte():
    constraints = [
        {"constraint_id": "c1", "operator": "<=", "target": "var_x", "value": 0.1, "is_hard": True, "type": "numeric"},
        {"constraint_id": "c2", "operator": ">=", "target": "var_x", "value": 0.3, "is_hard": True, "type": "numeric"},
    ]
    issues = check_constraint_feasibility(constraints, [])
    assert len(issues) == 1


def test_constraint_feasibility_ignores_soft_constraints():
    constraints = [
        {"constraint_id": "c1", "operator": ">=", "target": "var_x", "value": 0.4, "is_hard": False, "type": "numeric"},
        {"constraint_id": "c2", "operator": "<=", "target": "var_x", "value": 0.2, "is_hard": False, "type": "numeric"},
    ]
    assert check_constraint_feasibility(constraints, []) == []


def test_constraint_feasibility_ignores_different_targets():
    constraints = [
        {"constraint_id": "c1", "operator": ">=", "target": "var_x", "value": 0.4, "is_hard": True, "type": "numeric"},
        {"constraint_id": "c2", "operator": "<=", "target": "var_y", "value": 0.2, "is_hard": True, "type": "numeric"},
    ]
    assert check_constraint_feasibility(constraints, []) == []


# ---------------------------------------------------------------------------
# run_checks (ConsistencyReport)
# ---------------------------------------------------------------------------

def test_run_checks_clean_schema():
    schema = {
        "variables": [
            _var("var_a", affects=["var_b"]),
            _var("var_b"),
        ],
        "constraints": [],
    }
    report = run_checks(schema)
    assert isinstance(report, ConsistencyReport)
    assert report.cycles == []
    assert report.temporal_warnings == []
    assert report.constraint_conflicts == []
    assert report.overall_score == 1.0


def test_run_checks_score_decrements_on_cycle():
    schema = {
        "variables": [
            _var("var_a", affects=["var_b"]),
            _var("var_b", affects=["var_a"]),
        ],
        "constraints": [],
    }
    report = run_checks(schema)
    assert len(report.cycles) == 1
    assert report.overall_score == pytest.approx(0.85, abs=0.01)


def test_run_checks_score_floor_at_zero():
    # Many cycles should not go below 0
    variables = [_var(f"var_{i}", affects=[f"var_{(i+1) % 10}"]) for i in range(10)]
    schema = {"variables": variables, "constraints": []}
    report = run_checks(schema)
    assert report.overall_score >= 0.0
