from __future__ import annotations

import numpy as np

# This module implements the aggregation logic for simulation utilities, 
# combining multiple metrics into a single score for ranking actions.

# Score = Mean - L1·StdDev - L2·Downside% - L3·|CVaR| + L4·Upside%
# L1/L2/L4 per spec §4.8. L3 (CVaR tail) added per Pattern Engine v2 §8 —
# pattern engine raises L3 for founders with catastrophic tail history.
L1 = 0.30   # volatility penalty
L2 = 0.40   # downside probability penalty
L3 = 0.10   # CVaR tail penalty (pattern engine adjustable, max +50%)
L4 = 0.20   # upside bonus (pattern engine adjustable, max -40%)


def aggregate(utilities: np.ndarray, lambdas: dict | None = None) -> dict:
    lam = lambdas or {"lambda1": L1, "lambda2": L2, "lambda3": L3, "lambda4": L4}

    mean_u = float(np.mean(utilities))
    std_u = float(np.std(utilities))
    downside = float(np.mean(utilities < 0.5))

    # CVaR (Conditional Value at Risk) at 5% level
    p5 = np.percentile(utilities, 5)
    tail = utilities[utilities <= p5]
    cvar = float(np.mean(tail)) if len(tail) > 0 else float(p5)

    upside = float(np.mean(utilities > 0.5))
    score = (
        mean_u
        - lam["lambda1"] * std_u
        - lam["lambda2"] * downside
        - lam["lambda3"] * abs(cvar)
        + lam["lambda4"] * upside
    )

    p80 = np.percentile(utilities, 80)
    p20 = np.percentile(utilities, 20)
    top_band = utilities[utilities >= p80]
    bottom_band = utilities[utilities <= p20]

    best_case = float(np.mean(top_band)) if len(top_band) > 0 else float(p80)
    base_case = float(np.percentile(utilities, 50))
    worst_case = float(np.mean(bottom_band)) if len(bottom_band) > 0 else float(p20)

    hist, bin_edges = np.histogram(utilities, bins=50, range=(0.0, 1.0), density=True)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    histogram = [[round(float(c), 4), round(float(h), 4)] for c, h in zip(bin_centers, hist)]

    return {
        "mean": round(mean_u, 4),
        "std": round(std_u, 4),
        "downside": round(downside, 4),
        "cvar": round(cvar, 4),
        "upside": round(upside, 4),
        "score": round(score, 4),
        "best_case": round(best_case, 4),
        "base_case": round(base_case, 4),
        "worst_case": round(worst_case, 4),
        "histogram": histogram,
    }


def build_results(
    action_map: dict[str, np.ndarray],
    actions: list[dict],
    lambdas: dict | None = None,
) -> tuple[list[dict], float]:
    label_map = {
        (a.get("action_id") or a.get("id") or ""): a.get("label", "")
        for a in actions
    }
    scored = []
    for action_id, utilities in action_map.items():
        metrics = aggregate(utilities, lambdas)
        metrics["id"] = action_id
        metrics["label"] = label_map.get(action_id, action_id)
        scored.append(metrics)

    scored.sort(key=lambda x: x["score"], reverse=True)

    if len(scored) >= 2:
        w_utils = action_map[scored[0]["id"]]
        r_utils = action_map[scored[1]["id"]]
        confidence = float(np.mean(w_utils > r_utils))
    else:
        confidence = 1.0

    return scored, round(confidence, 4)
