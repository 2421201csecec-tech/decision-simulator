from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger("simulation.monte_carlo")

N_SIMS = 10_000
N_SENSITIVITY = 1_000 # Reduced sims for sensitivity to keep latency low. Results are noisy but directionally correct.


IMPORTANCE_WEIGHTS = {"critical": 0.40, "high": 0.25, "medium": 0.20, "low": 0.15} 
# Variable importance weights for scoring. Must sum to 1.0 or less.


def _variable_distribution(
    var: dict,
    override_value: float | None = None,
    user_value: float | None = None,
) -> tuple[float, float]:
    """Return (mean, std) for a variable.

    Priority: action_variable_map override > user_selected_value > range midpoint.
    Action override wins because it reflects what that specific option actually does.
    user_value sets the base scenario the founder wants to explore.
    """
    r = var.get("range") or [0.0, 1.0]
    width = float(r[1]) - float(r[0])
    confidence = float(var.get("extraction_confidence", 0.5))

    if override_value is not None:
        mean = float(override_value)
        std = (width / 6) * (1.0 - confidence * 0.8)
    elif user_value is not None:
        mean = float(user_value)
        std = (width / 4) * (1.0 - confidence * 0.8)
    else:
        mean = (float(r[0]) + float(r[1])) / 2
        std = (width / 4) * (1.0 - confidence * 0.8)

    return mean, max(std, 1e-6)


def _run(schema: dict, user_values: dict[str, float], n: int) -> dict[str, np.ndarray]:
    # NOTE: variables are sampled independently.
    # DAG propagation through affects[] is deferred to Phase 2 enhancement.
    # Current approach gives directionally correct scores but misses causal cascades
    # (e.g. mrr_growth → arr → cash_flow chain is not modelled).
    variables = [
        v for v in (schema.get("variables") or [])
        if v.get("type") in ("continuous", "ordinal")
    ]
    actions = schema.get("actions") or []
    action_variable_map = schema.get("action_variable_map") or {}
    if not variables or not actions:
        return {}

    total_weight = sum(
        IMPORTANCE_WEIGHTS.get(v.get("importance", "medium"), 0.20) for v in variables
    )

    logger.info(
        "monte_carlo_start actions=%d variables=%d avm_populated=%s avm_keys=%s",
        len(actions), len(variables), bool(action_variable_map), list(action_variable_map.keys()),
    )

    results: dict[str, np.ndarray] = {}
    for action in actions:
        action_id = action.get("action_id") or action.get("id") or ""
        action_vars: dict[str, float] = action_variable_map.get(action_id, {})
        utilities = np.zeros(n)

        override_count = 0
        for var in variables:
            var_id = var.get("variable_id") or ""
            raw = action_vars.get(var_id)
            override_value = raw if raw is not None else action_vars.get(f"var_{var_id}")
            if override_value is not None:
                override_count += 1
            user_value = user_values.get(var_id)
            mean, std = _variable_distribution(var, override_value, user_value)

            r = var.get("range") or [0.0, 1.0]
            lo, hi = float(r[0]), float(r[1])
            samples = np.clip(np.random.normal(mean, std, n), lo, hi)
            norm = (samples - lo) / (hi - lo + 1e-9)
            direction_sign = -1.0 if var.get("direction") == "minimize" else 1.0
            weight = IMPORTANCE_WEIGHTS.get(var.get("importance", "medium"), 0.20)
            utilities += direction_sign * weight * norm

        logger.info(
            "monte_carlo_action action_id=%s label=%s avm_vars=%d override_count=%d",
            action_id, action.get("label", ""), len(action_vars), override_count,
        )

        utilities /= max(total_weight, 1e-9)
        # Raw range is [-1, +1]: maximize vars contribute positive, minimize vars negative.
        # Shift to [0, 1] so 0.5 = neutral, 1.0 = ideal, 0.0 = worst.
        utilities = (utilities + 1) / 2
        results[action_id] = utilities

    return results


def run_monte_carlo(schema: dict, user_values: dict[str, float] | None = None) -> dict[str, np.ndarray]:
    """Run 10k simulations per action. Returns {action_id: np.array of utility values}."""
    return _run(schema, user_values or {}, N_SIMS)


def run_sensitivity(
    schema: dict,
    user_values: dict[str, float],
    baseline_scores: dict[str, float],
) -> str | None:
    """Perturb each variable +20% and measure score delta. Returns variable_id with highest impact.

    Uses N_SENSITIVITY=1000 runs to keep latency low.
    The returned variable_id becomes key_assumption in the LLM explanation prompt.
    """
    from app.simulation.aggregator import aggregate

    variables = [
        v for v in (schema.get("variables") or [])
        if v.get("type") in ("continuous", "ordinal")
    ]
    if not variables or not baseline_scores:
        return None

    winner_id = max(baseline_scores, key=lambda k: baseline_scores[k])
    impacts: dict[str, float] = {}

    for var in variables:
        var_id = var.get("variable_id") or ""
        r = var.get("range") or [0.0, 1.0]
        lo, hi = float(r[0]), float(r[1])
        base_val = user_values.get(var_id, (lo + hi) / 2)
        perturbed_val = min(base_val * 1.20, hi)
        perturbed_values = {**user_values, var_id: perturbed_val}

        action_map = _run(schema, perturbed_values, N_SENSITIVITY)
        if winner_id not in action_map:
            continue

        new_score = aggregate(action_map[winner_id])["score"]
        impacts[var_id] = abs(new_score - baseline_scores[winner_id])

    return max(impacts, key=lambda k: impacts[k]) if impacts else None
