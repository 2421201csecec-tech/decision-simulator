from __future__ import annotations

import numpy as np

LAMBDA1 = 0.30  # std penalty
LAMBDA2 = 0.40  # downside probability penalty
LAMBDA3 = 0.20  # CVaR penalty
LAMBDA4 = 0.10  # upside bonus


def aggregate(utilities: np.ndarray) -> dict:
    mean_u = float(np.mean(utilities))
    std_u = float(np.std(utilities))
    downside = float(np.mean(utilities < 0))

    p5 = np.percentile(utilities, 5)
    tail = utilities[utilities <= p5]
    cvar = float(np.mean(tail)) if len(tail) > 0 else float(p5)

    upside = float(np.mean(utilities > 0.5))
    score = mean_u - LAMBDA1 * std_u - LAMBDA2 * downside - LAMBDA3 * abs(cvar) + LAMBDA4 * upside

    p80 = np.percentile(utilities, 80)
    p20 = np.percentile(utilities, 20)
    top_band = utilities[utilities >= p80]
    bottom_band = utilities[utilities <= p20]

    best_case = float(np.mean(top_band)) if len(top_band) > 0 else float(p80)
    base_case = float(np.percentile(utilities, 50))
    worst_case = float(np.mean(bottom_band)) if len(bottom_band) > 0 else float(p20)

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
    }


def build_results(
    action_map: dict[str, np.ndarray],
    actions: list[dict],
) -> tuple[list[dict], float]:
    label_map = {
        (a.get("action_id") or a.get("id") or ""): a.get("label", "")
        for a in actions
    }
    scored = []
    for action_id, utilities in action_map.items():
        metrics = aggregate(utilities)
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
