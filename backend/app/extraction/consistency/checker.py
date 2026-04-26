from __future__ import annotations

from app.extraction.schemas import ConsistencyReport
from .dag import build_dag, check_cycles, check_temporal_consistency


def check_constraint_feasibility(constraints: list[dict], variables: list[dict]) -> list[str]:
    """Detect contradictory hard constraints on the same target variable."""
    hard = [c for c in constraints if c.get("is_hard") and c.get("type") == "numeric"]
    by_target: dict[str, list[dict]] = {}
    for c in hard:
        t = c.get("target", "")
        if t:
            by_target.setdefault(t, []).append(c)

    issues = []
    for target, cons in by_target.items():
        for i in range(len(cons)):
            for j in range(i + 1, len(cons)):
                if _contradicts(cons[i], cons[j]):
                    issues.append(
                        f"Contradictory constraints on '{target}': "
                        f"{cons[i].get('operator')} {cons[i].get('value')} "
                        f"AND {cons[j].get('operator')} {cons[j].get('value')}"
                    )
    return issues


def _contradicts(c1: dict, c2: dict) -> bool:
    try:
        v1, v2 = float(c1["value"]), float(c2["value"])
    except (KeyError, TypeError, ValueError):
        return False
    op1, op2 = c1.get("operator"), c2.get("operator")
    if op1 == ">=" and op2 == "<=" and v1 > v2:
        return True
    if op1 == "<=" and op2 == ">=" and v1 < v2:
        return True
    return False


def run_checks(schema: dict) -> ConsistencyReport:
    variables = schema.get("variables", [])
    constraints = schema.get("constraints", [])

    G = build_dag(variables)
    cycles = check_cycles(G)
    temporal_warnings = check_temporal_consistency(G, variables)
    constraint_conflicts = check_constraint_feasibility(constraints, variables)

    score = 1.0
    score -= 0.15 * len(cycles)
    score -= 0.05 * len(temporal_warnings)
    score -= 0.05 * len(constraint_conflicts)
    score = max(0.0, round(score, 4))

    return ConsistencyReport(
        cycles=cycles,
        temporal_warnings=temporal_warnings,
        constraint_conflicts=constraint_conflicts,
        overall_score=score,
    )
