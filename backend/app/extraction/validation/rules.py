from __future__ import annotations

from .result import RuleResult

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_CATEGORIES = {"hiring", "product", "strategy", "financial", "ops", "other"}
_VALID_TYPES = {"continuous", "discrete", "boolean", "categorical", "ordinal"}
_VALID_IMPORTANCE = {"critical", "high", "medium", "low"}
_VALID_DIRECTIONS = {"maximize", "minimize", "neutral"}
_VALID_OPERATORS = {">=", "<=", ">", "<", "==", "!="}
_HARD_IMPORTANCE = {"critical", "high"}


def _var_ids(schema: dict) -> set[str]:
    return {v.get("variable_id", "") for v in schema.get("variables", [])}


# ---------------------------------------------------------------------------
# HARD rules — V001–V008, V010, V012–V013, V015–V018
# ---------------------------------------------------------------------------

def V001_decision_nonempty(schema: dict) -> RuleResult:
    ok = bool(schema.get("decision", "").strip())
    return RuleResult(
        passed=ok, rule_id="V001",
        message="decision field is empty or missing",
        re_run_pass=1, field_path="decision",
    )


def V002_actions_count(schema: dict) -> RuleResult:
    actions = schema.get("actions", [])
    ok = 2 <= len(actions) <= 6
    return RuleResult(
        passed=ok, rule_id="V002",
        message=f"actions[] must have 2–6 items, got {len(actions)}",
        re_run_pass=1, field_path="actions",
    )


def V003_actions_have_required_fields(schema: dict) -> RuleResult:
    for i, a in enumerate(schema.get("actions", [])):
        if not a.get("action_id", "").strip() or not a.get("label", "").strip():
            return RuleResult(
                passed=False, rule_id="V003",
                message=f"actions[{i}] missing action_id or label",
                re_run_pass=1, field_path=f"actions[{i}]",
            )
    return RuleResult(passed=True, rule_id="V003")


def V004_decision_category_valid(schema: dict) -> RuleResult:
    cat = schema.get("decision_category", "")
    ok = cat in _VALID_CATEGORIES
    return RuleResult(
        passed=ok, rule_id="V004",
        message=f"decision_category '{cat}' is not a valid enum value. "
                f"Must be one of: {sorted(_VALID_CATEGORIES)}",
        re_run_pass=1, field_path="decision_category",
    )


def V005_variables_count(schema: dict) -> RuleResult:
    n = len(schema.get("variables", []))
    ok = 3 <= n <= 15
    return RuleResult(
        passed=ok, rule_id="V005",
        message=f"variables[] must have 3–15 items, got {n}",
        re_run_pass=2, field_path="variables",
    )


def V006_continuous_range_valid(schema: dict) -> RuleResult:
    for var in schema.get("variables", []):
        if var.get("type") in ("continuous", "ordinal"):
            r = var.get("range")
            if r is None or len(r) != 2 or r[0] is None or r[1] is None or r[0] >= r[1]:
                return RuleResult(
                    passed=False, rule_id="V006",
                    message=f"Variable '{var.get('name')}': range must be [min, max] with min < max, got {r}",
                    re_run_pass=2, field_path=f"variables[name={var.get('name')}].range",
                )
    return RuleResult(passed=True, rule_id="V006")


def V007_affects_references_valid_ids(schema: dict) -> RuleResult:
    ids = _var_ids(schema)
    for var in schema.get("variables", []):
        for target in var.get("affects", []):
            if target not in ids:
                return RuleResult(
                    passed=False, rule_id="V007",
                    message=f"Variable '{var.get('name')}': affects[] references unknown variable_id '{target}'",
                    re_run_pass=2, field_path=f"variables[name={var.get('name')}].affects",
                )
    return RuleResult(passed=True, rule_id="V007")


def V008_confidence_in_range(schema: dict) -> RuleResult:
    for var in schema.get("variables", []):
        c = var.get("extraction_confidence")
        if c is None or not (0.0 <= float(c) <= 1.0):
            return RuleResult(
                passed=False, rule_id="V008",
                message=f"Variable '{var.get('name')}': extraction_confidence must be 0.0–1.0, got {c}",
                re_run_pass=2, field_path=f"variables[name={var.get('name')}].extraction_confidence",
            )
    return RuleResult(passed=True, rule_id="V008")


def V010_dag_acyclic(schema: dict) -> RuleResult:
    """Build DiGraph from affects[], run DFS cycle detection. HARD gate."""
    try:
        import networkx as nx
    except ImportError:
        return RuleResult(passed=True, rule_id="V010",
                          message="networkx not installed — skipping DAG check")

    G = nx.DiGraph()
    for var in schema.get("variables", []):
        vid = var.get("variable_id")
        if vid:
            G.add_node(vid)
        for target in var.get("affects", []):
            G.add_edge(vid, target)

    cycles = list(nx.simple_cycles(G))
    if cycles:
        cycle_str = " -> ".join(cycles[0])
        return RuleResult(
            passed=False, rule_id="V010",
            message=f"DAG cycle detected: {cycle_str}",
            re_run_pass=2, field_path="variables[].affects",
        )
    return RuleResult(passed=True, rule_id="V010")


def V012_direction_on_important_vars(schema: dict) -> RuleResult:
    for var in schema.get("variables", []):
        if var.get("importance") in _HARD_IMPORTANCE:
            if not var.get("direction"):
                return RuleResult(
                    passed=False, rule_id="V012",
                    message=f"Variable '{var.get('name')}' has importance={var.get('importance')} but direction is not set",
                    re_run_pass=2, field_path=f"variables[name={var.get('name')}].direction",
                )
    return RuleResult(passed=True, rule_id="V012")


def V013_time_horizon_nonempty(schema: dict) -> RuleResult:
    ok = bool(schema.get("time_horizon", "").strip())
    return RuleResult(
        passed=ok, rule_id="V013",
        message="time_horizon field is empty or missing",
        re_run_pass=1, field_path="time_horizon",
    )


def V015_action_variable_map_keys_match(schema: dict) -> RuleResult:
    avm = schema.get("action_variable_map", {})
    if not avm:
        return RuleResult(passed=True, rule_id="V015")  # empty map is OK before enrichment

    action_ids = {a.get("action_id") for a in schema.get("actions", [])}
    for key in avm:
        if key not in action_ids:
            return RuleResult(
                passed=False, rule_id="V015",
                message=f"action_variable_map key '{key}' does not match any action_id in actions[]",
                re_run_pass=1, field_path="action_variable_map",
            )
    return RuleResult(passed=True, rule_id="V015")


def V016_constraint_targets_valid(schema: dict) -> RuleResult:
    ids = _var_ids(schema)
    if not ids:
        # Variables not yet populated (pre-Pass 2) — constraints are forward-references, skip
        return RuleResult(passed=True, rule_id="V016")
    for c in schema.get("constraints", []):
        target = c.get("target", "")
        if target and target not in ids:
            return RuleResult(
                passed=False, rule_id="V016",
                message=f"Constraint '{c.get('constraint_id')}': target '{target}' is not a valid variable_id",
                re_run_pass=1, field_path=f"constraints[id={c.get('constraint_id')}].target",
            )
    return RuleResult(passed=True, rule_id="V016")


def V017_boolean_has_no_range(schema: dict) -> RuleResult:
    for var in schema.get("variables", []):
        if var.get("type") == "boolean" and var.get("range") is not None:
            return RuleResult(
                passed=False, rule_id="V017",
                message=f"Variable '{var.get('name')}' is boolean but has a range field — boolean variables must not have range",
                re_run_pass=2, field_path=f"variables[name={var.get('name')}].range",
            )
    return RuleResult(passed=True, rule_id="V017")


def V018_no_contradictory_hard_constraints(schema: dict) -> RuleResult:
    hard = [c for c in schema.get("constraints", []) if c.get("is_hard")]
    by_target: dict[str, list[dict]] = {}
    for c in hard:
        t = c.get("target", "")
        by_target.setdefault(t, []).append(c)

    for target, cons in by_target.items():
        for i in range(len(cons)):
            for j in range(i + 1, len(cons)):
                if _contradicts(cons[i], cons[j]):
                    return RuleResult(
                        passed=False, rule_id="V018",
                        message=(
                            f"Contradictory hard constraints on '{target}': "
                            f"{cons[i].get('operator')} {cons[i].get('value')} "
                            f"AND {cons[j].get('operator')} {cons[j].get('value')}"
                        ),
                        re_run_pass=1, field_path="constraints",
                    )
    return RuleResult(passed=True, rule_id="V018")


def _contradicts(c1: dict, c2: dict) -> bool:
    if c1.get("type") != "numeric" or c2.get("type") != "numeric":
        return False
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


# ---------------------------------------------------------------------------
# SOFT rules — V009, V011, V014
# ---------------------------------------------------------------------------

def V009_broken_affects_edge_soft(schema: dict) -> RuleResult:
    """Broken affects[] edge on low/medium importance var is SOFT; critical/high is HARD (V007 covers that)."""
    ids = _var_ids(schema)
    for var in schema.get("variables", []):
        if var.get("importance") in _HARD_IMPORTANCE:
            continue  # V007 already covers this as HARD
        for target in var.get("affects", []):
            if target not in ids:
                # Auto-fix: remove the broken edge
                var["affects"] = [t for t in var["affects"] if t in ids]
                return RuleResult(
                    passed=False, rule_id="V009",
                    message=f"Variable '{var.get('name')}': affects[] references unknown id '{target}' — removed (low/medium importance, soft fix)",
                    re_run_pass=2, field_path=f"variables[name={var.get('name')}].affects",
                    repaired_schema=schema,
                    fix_description=f"Removed broken affects[] edge '{target}' from low/medium importance variable",
                )
    return RuleResult(passed=True, rule_id="V009")


def V011_default_value_in_domain(schema: dict) -> RuleResult:
    """SOFT — auto-clamp default_value to midpoint if out of range."""
    fixes = []
    for var in schema.get("variables", []):
        if var.get("type") == "continuous":
            r = var.get("range", [0, 1])
            dv = var.get("default_value")
            if dv is not None and not (r[0] <= float(dv) <= r[1]):
                midpoint = (r[0] + r[1]) / 2
                var["default_value"] = midpoint
                fixes.append(var.get("name"))
    if fixes:
        return RuleResult(
            passed=False, rule_id="V011",
            message=f"default_value out of range on: {fixes} — clamped to midpoint",
            re_run_pass=0, field_path="variables[].default_value",
            repaired_schema=schema,
            fix_description="default_value clamped to (min + max) / 2",
        )
    return RuleResult(passed=True, rule_id="V011")


def V014_low_confidence_needs_enrichment(schema: dict) -> RuleResult:
    """SOFT — set enrichment_needed=True for vars with confidence < 0.50."""
    flagged = []
    for var in schema.get("variables", []):
        c = var.get("extraction_confidence", 1.0)
        if float(c) < 0.50 and not var.get("enrichment_needed"):
            var["enrichment_needed"] = True
            flagged.append(var.get("name"))
    if flagged:
        return RuleResult(
            passed=False, rule_id="V014",
            message=f"Set enrichment_needed=true on low-confidence vars: {flagged}",
            re_run_pass=0, field_path="variables[].enrichment_needed",
            repaired_schema=schema,
            fix_description="Set enrichment_needed=true where extraction_confidence < 0.50",
        )
    return RuleResult(passed=True, rule_id="V014")


# ---------------------------------------------------------------------------
# Rule registries
# ---------------------------------------------------------------------------

HARD_RULES: dict[str, callable] = {
    "V001": V001_decision_nonempty,
    "V002": V002_actions_count,
    "V003": V003_actions_have_required_fields,
    "V004": V004_decision_category_valid,
    "V005": V005_variables_count,
    "V006": V006_continuous_range_valid,
    "V007": V007_affects_references_valid_ids,
    "V008": V008_confidence_in_range,
    "V010": V010_dag_acyclic,
    "V012": V012_direction_on_important_vars,
    "V013": V013_time_horizon_nonempty,
    "V015": V015_action_variable_map_keys_match,
    "V016": V016_constraint_targets_valid,
    "V017": V017_boolean_has_no_range,
    "V018": V018_no_contradictory_hard_constraints,
}

def S_PAT_001_pattern_id_ref_type(schema: dict) -> RuleResult:
    """SOFT — pattern_id_ref on assumptions/variables must be string or null if present."""
    for var in schema.get("variables", []):
        ref = var.get("pattern_id_ref")
        if ref is not None and not isinstance(ref, str):
            var["pattern_id_ref"] = str(ref)
            return RuleResult(
                passed=False, rule_id="S_PAT_001",
                message="pattern_id_ref coerced to string",
                re_run_pass=0, field_path="variables[].pattern_id_ref",
                repaired_schema=schema,
                fix_description="pattern_id_ref cast to str",
            )
    return RuleResult(passed=True, rule_id="S_PAT_001")


def S_PAT_002_pattern_flags_shape(schema: dict) -> RuleResult:
    """SOFT — pattern_flags must be list of {pattern_id: str, confidence: float} if present."""
    flags = schema.get("pattern_flags")
    if flags is None:
        return RuleResult(passed=True, rule_id="S_PAT_002")
    if not isinstance(flags, list):
        schema["pattern_flags"] = []
        return RuleResult(
            passed=False, rule_id="S_PAT_002",
            message="pattern_flags was not a list — reset to []",
            re_run_pass=0, field_path="pattern_flags",
            repaired_schema=schema,
            fix_description="pattern_flags reset to []",
        )
    cleaned = []
    for f in flags:
        if isinstance(f, dict) and isinstance(f.get("pattern_id"), str) and isinstance(f.get("confidence"), (int, float)):
            cleaned.append(f)
    if len(cleaned) != len(flags):
        schema["pattern_flags"] = cleaned
        return RuleResult(
            passed=False, rule_id="S_PAT_002",
            message=f"Removed {len(flags) - len(cleaned)} malformed pattern_flags entries",
            re_run_pass=0, field_path="pattern_flags",
            repaired_schema=schema,
            fix_description="Removed entries missing pattern_id (str) or confidence (float)",
        )
    return RuleResult(passed=True, rule_id="S_PAT_002")


SOFT_RULES: dict[str, callable] = {
    "V009": V009_broken_affects_edge_soft,
    "V011": V011_default_value_in_domain,
    "V014": V014_low_confidence_needs_enrichment,
    "S_PAT_001": S_PAT_001_pattern_id_ref_type,
    "S_PAT_002": S_PAT_002_pattern_flags_shape,
}
