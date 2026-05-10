from __future__ import annotations

import logging
import math
from uuid import uuid4

from app.pattern_engine.confidence import compute_confidence, recency_days_from
from app.pattern_engine.constants import DEDUP_MERGE_SIM, DEDUP_THEME_SIM

logger = logging.getLogger("pattern_engine.dedup")


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _recompute_confidence(theme: dict) -> dict:
    """Recompute confidence for a theme using the standard formula."""
    days = recency_days_from(theme.get("last_seen"))
    new_conf = compute_confidence(
        recency_days=days,
        consistency=theme.get("consistency"),
        outcome_confirmation=theme.get("outcome_confirmation"),
        count=int(theme.get("count", 1)),
    )
    theme["confidence"] = new_conf
    return theme


def _merge_themes(base: dict, incoming: dict, decision_id: str) -> dict:
    """Merge incoming theme into base: increment count, append seen_in, update last_seen, recompute confidence."""
    base["count"] = int(base.get("count", 1)) + 1

    seen = list(base.get("seen_in") or [])
    if decision_id and decision_id not in seen:
        seen.append(decision_id)
    base["seen_in"] = seen

    # Update last_seen to most recent
    incoming_last = incoming.get("last_seen") or ""
    base_last = base.get("last_seen") or ""
    if incoming_last > base_last:
        base["last_seen"] = incoming_last

    # Update statement if incoming is more detailed
    if incoming.get("statement") and len(str(incoming["statement"])) > len(str(base.get("statement", ""))):
        base["statement"] = incoming["statement"]

    return _recompute_confidence(base)


def run_dedup(existing_themes: list[dict], new_theme: dict, decision_id: str) -> list[dict]:
    """
    Apply merge rules from spec Section 7 against existing themes.

    | Cosine Sim  | Same failure_type? | Action                                  |
    |-------------|--------------------|-----------------------------------------|
    | > 0.85      | any                | Merge: count++, recompute confidence    |
    | 0.65–0.85   | Yes                | Merge as above                          |
    | 0.65–0.85   | No                 | Create child under same theme           |
    | < 0.65      | —                  | New top-level theme                     |

    Patterns without embeddings skip cosine check and always append as new.
    Returns the updated themes list.
    """
    new_emb = new_theme.get("embedding")
    if not new_emb:
        logger.debug("dedup: new_theme has no embedding — appending as new")
        existing_themes.append(new_theme)
        return existing_themes

    new_failure_type = str(new_theme.get("failure_mode", "") or new_theme.get("pattern_type", "")).lower()

    best_sim = 0.0
    best_idx = -1

    for i, theme in enumerate(existing_themes):
        t_emb = theme.get("embedding")
        if not t_emb:
            continue
        sim = _cosine_sim(new_emb, t_emb)
        if sim > best_sim:
            best_sim = sim
            best_idx = i

    if best_sim > DEDUP_MERGE_SIM:
        # Strong match — merge unconditionally
        existing_themes[best_idx] = _merge_themes(dict(existing_themes[best_idx]), new_theme, decision_id)
        logger.debug("dedup: merged (sim=%.3f > %.2f)", best_sim, DEDUP_MERGE_SIM)

    elif DEDUP_THEME_SIM <= best_sim <= DEDUP_MERGE_SIM:
        match_failure_type = str(
            existing_themes[best_idx].get("failure_mode", "") or
            existing_themes[best_idx].get("pattern_type", "")
        ).lower()

        if new_failure_type == match_failure_type:
            # Same failure type in 0.65–0.85 range — merge
            existing_themes[best_idx] = _merge_themes(dict(existing_themes[best_idx]), new_theme, decision_id)
            logger.debug("dedup: merged same failure_type (sim=%.3f)", best_sim)
        else:
            # Different failure type — create child under same parent theme
            child = dict(new_theme)
            child["parent_pattern_id"] = existing_themes[best_idx].get("pattern_id")
            child["pattern_id"] = child.get("pattern_id") or str(uuid4())
            existing_themes.append(child)
            logger.debug("dedup: created child (sim=%.3f, diff failure_type)", best_sim)

    else:
        # New top-level theme
        new_theme["pattern_id"] = new_theme.get("pattern_id") or str(uuid4())
        existing_themes.append(new_theme)
        logger.debug("dedup: new top-level theme (best_sim=%.3f)", best_sim)

    return existing_themes
