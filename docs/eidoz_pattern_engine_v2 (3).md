# EIDOZ — Pattern Engine Spec v2.0

> **Addendum to:** Master Architecture v1.0 + DB Safety v1.5  
> **Date:** April 2025  
> **Classification:** CONFIDENTIAL

---

## Table of Contents

1. [Full Pipeline Architecture](#1-full-pipeline-architecture)
2. [blend_weight — Replaces V1/V2/V3](#2-blend_weight--replaces-v1v2v3)
3. [Pattern Enrichment Layer (NEW)](#3-pattern-enrichment-layer-new)
4. [Extraction Layer — Precise Change Map](#4-extraction-layer--precise-change-map)
5. [Pattern Confidence Formula](#5-pattern-confidence-formula)
6. [Pattern Decay Formula](#6-pattern-decay-formula)
7. [Pattern Deduplication & Taxonomy](#7-pattern-deduplication--taxonomy)
8. [Pattern → Scoring: Lambda Adjustments](#8-pattern--scoring-lambda-adjustments)
9. [Testing & Validation Strategy](#9-testing--validation-strategy)
10. [Global ↔ Personal Feedback Loop](#10-global--personal-feedback-loop)
11. [Database Schema Changes](#11-database-schema-changes)
12. [Pre-Launch Checklist](#12-pre-launch-checklist)
13. [Quick Reference — All Constants & Thresholds](#13-quick-reference--all-constants--thresholds)

---

## 1. Full Pipeline Architecture

### Pipeline Stages

| Layer | Status | Pattern Engine Touch Point |
|---|---|---|
| Pass 1 — Intent & Scope | **Unchanged** | None |
| Pass 2 — Variable Extraction | **Modified** | Post-processing: `apply_pattern_importance_boost()` on output. No prompt change. |
| Pass 3 — Risk & Assumptions | **Modified** | System prompt receives injection block (max 3 patterns). Fragility re-evaluation only. No new variables. |
| Schema Validator | **Unchanged** | Validates new fields: `pattern_flags[]`, `pattern_id_ref` (soft rules only) |
| Pattern Enrichment Layer | **NEW** | Reads completed schema + active patterns. Programmatic similarity only. Writes to `known_unknowns[]`, `pattern_flags[]`. **NEVER** to `variables[]`. |
| Consistency Engine | **Unchanged** | Receives enriched schema |
| Capability Gate | **Modified** | Computes capabilities from `blend_weight`. Outputs lambda injection payload. |
| Scoring Engine | **Modified** | Receives pattern-adjusted lambdas. Stores `base_score` AND `adjusted_score`. |
| Explanation Layer | **Modified** | Adds `pattern_note` field when lambdas were adjusted. |
| Memory / Feedback | **Modified** | Writes confirmed patterns back to `aggregate_patterns` (anonymised). |

> **Legend:** Teal `NEW` = Pattern Enrichment Layer (only new component). Purple = modified layers. Dashed lines = pattern engine connections.

---

## 2. blend_weight — Replaces V1/V2/V3

### Formula

```
blend_weight = (decision_signal × 0.40) + (outcome_signal × 0.40) + (confidence_signal × 0.20)

decision_signal = min(1.0, n_decisions / 20)
outcome_signal  = min(1.0, n_outcomes / 10)
```

```python
def compute_blend_weight(user_id):
    return (
        min(1.0, n_decisions / 20) * 0.40
        + min(1.0, n_outcomes / 10) * 0.40
        + mean_pattern_confidence * 0.20
    )
```

> **Key principle:** `blend_weight` rises **continuously** — no cliff edges.

### Capability Flags

| Capability Flag | Activates At | What It Enables |
|---|---|---|
| `use_global_priors` | Always | Global `aggregate_patterns` as priors. Always on. |
| `use_pattern_injection` | `blend_weight ≥ 0.20` | Pattern injection into Pass 3 + importance boost in Pass 2 |
| `use_failure_biasing` | `blend_weight ≥ 0.45` | Lambda adjustments in Scoring Engine |
| `use_predictive_adjustment` | `blend_weight ≥ 0.75` | Pre-emptive failure flagging in Pressure Test |

```python
def get_capabilities(user_id):
    bw = compute_blend_weight(user_id)
    return {
        'use_global_priors':          True,
        'use_pattern_injection':      bw >= 0.20,
        'use_failure_biasing':        bw >= 0.45,
        'use_predictive_adjustment':  bw >= 0.75,
        'active_patterns':            get_patterns(user_id, min_conf=0.45)
    }
```

---

## 3. Pattern Enrichment Layer (NEW)

### Overview

- **Input:** Completed schema + active patterns (`conf ≥ 0.45`)
- **Output:** Appends to `known_unknowns[]` and `pattern_flags[]` only
- **No LLM call** — programmatic cosine similarity only
- **NEVER writes to `variables[]`**

### Hard Rules

| Rule | Value | Reason |
|---|---|---|
| Never writes to `variables[]` | **Absolute** | Hallucination firewall. Only Extraction creates variables. |
| No LLM for gap detection | **Absolute** | Programmatic cosine similarity only. LLM stays in Pass 3. |
| Max patterns injected | **3** | More overwhelms downstream. Ranked by confidence descending. |
| Min confidence gate | **0.45** | Below this: too weak, risk of false positives. |
| Category scoping | **Required** | Hiring pattern ≠ pricing decision (unless `cross_category_applies=True`, weight × 0.5) |
| Failure mode | **Fire-and-forget** | If enrichment fails, log + pass schema unchanged. Never blocks main flow. |
| Performance target | **< 200ms** | No LLM = fast. Embedding similarity only. |

### New Fields Added to Extraction Schema

| Field | Location | Type | Purpose |
|---|---|---|---|
| `pattern_flags[]` | Schema root | `array {pattern_id, confidence}` | Which patterns were triggered in this extraction |
| `pattern_injection_used` | Schema root | `bool` | Observability — were patterns injected into Pass 3? |
| `pattern_match_score` | Per assumption | `float 0–1` | Cosine sim between assumption and matched pattern |
| `pattern_id_ref` | Per assumption | `uuid \| null` | Audit link — which pattern flagged this assumption |
| `fragility` (upgraded) | Per assumption | `low/medium/high` | Pattern match forces minimum `'high'` |
| `known_unknowns[]` (upgraded) | Schema root | `array` | Pre-seeded with pattern blind spots. `source='pattern_prior'` |
| `typical_missing_variables` | Pattern object | `string[]` | Variables this pattern historically omits — seeds enrichment |

---

## 4. Extraction Layer — Precise Change Map

### What Changes Per Pass

| Pass | What Changes | Nature | What Stays the Same |
|---|---|---|---|
| Pass 1 | Nothing | — | Fully unchanged — intent/scope extraction unaffected |
| Pass 2 | Post-processing function `apply_pattern_importance_boost()` runs after LLM returns, before validator | Additive code — no prompt change | All 15 variable fields, validation rules, `temp=0.1`, 2000 token limit |
| Pass 3 | System prompt receives `PATTERN_INJECTION_BLOCK` (max 3 patterns). Instruction: re-evaluate fragility only. | Prompt addition — output schema unchanged | All existing Pass 3 fields. `variables[]` never touched by injection. |
| Enrichment | Pre-seed `known_unknowns[]` from `pattern.typical_missing_variables`. Label `source='pattern_prior'` | Additive — new function before existing enrichment | All existing enrichment logic runs after |
| Validator | 2 new soft rules: `pattern_id_ref` type check, `pattern_flags[]` structure check | Additive — 2 soft rules only | All 18 existing rules unchanged |

### Pass 2 Post-Processing — Importance Boost

```python
def apply_pattern_importance_boost(variables, active_patterns, blend_weight):
    ESCALATE = {'low': 'medium', 'medium': 'high', 'high': 'critical'}
    for var in variables:
        for pat in active_patterns:
            if pat.confidence < 0.45:
                continue
            sim = cosine_sim(embed(var.name), pat.embedding)
            if sim > 0.70:
                if blend_weight >= 0.45:
                    var.importance = ESCALATE.get(var.importance, var.importance)
                var.pattern_id_ref = pat.pattern_id
                var.extraction_confidence = max(var.extraction_confidence, 0.80)
                break  # one match per variable
    return variables  # never changes variables[] structure
```

### Pass 3 Prompt Injection Block

```
SYSTEM (appended to existing Pass 3 prompt):

ACTIVE FOUNDER PATTERNS — apply to EXISTING assumptions only:
{pattern_list}  ← max 3, ranked by confidence

Rules:
  - Search existing assumptions[] for each pattern type
  - If found: set fragility='high', set pattern_id_ref
  - If absent but evidenced in schema: add to known_unknowns[]
    with source='pattern_inference'
  - DO NOT add to variables[]
  - DO NOT fabricate assumptions
  - DO NOT change variables[] in any way
```

---

## 5. Pattern Confidence Formula

```
confidence = recency×0.30 + consistency×0.35 + outcome_confirm×0.25 + count×0.10
```

### Component Details

| Component | Weight | Formula | Cold-Start Default | Saturates At |
|---|---|---|---|---|
| `recency_weight` | 0.30 | `exp(−0.693 × days_since / 90)` — half-life = 90d | needs timestamps | `1.0` (same day) |
| `consistency_score` | 0.35 | `mean(pairwise cosine_sim(evidence_embeddings))` — needs ≥ 2 items | `0.50` (neutral) | `1.0` (identical evidence) |
| `outcome_confirmation_rate` | 0.25 | `confirmed / total_outcomes_where_active` — needs outcome data | `0.50` (neutral prior) | `1.0` (all confirmed) |
| `count_weight` | 0.10 | `min(1.0, log(count+1) / log(6))` — log scale | `0.39` (count=1) | `1.0` (count ≥ 5) |

### Derived Thresholds — Replacing Hardcoded `0.55`

| Threshold | Value | Derivation |
|---|---|---|
| `INJECT_THRESHOLD` | **0.45** | recency=0.5 (90d) + count=2 → minimum meaningful signal |
| `BIAS_THRESHOLD` | **0.60** | Requires consistency > 0.5 AND some outcome confirmation |
| `PREDICT_THRESHOLD` | **0.75** | `outcome_confirmation_rate` clearly above 0.5 neutral |
| `DECAY_FLOOR` | **0.15** | Below this = noise. Archive pattern. |
| `CONFIRMED_FLOOR` | **0.40** | Min for patterns with `outcome_confirmation_rate > 0.80` |

---

## 6. Pattern Decay Formula

```
new_conf = conf × recency × disconfirm × outcome_correction
```

Three multiplicative decay factors applied **nightly** by Celery job (DB-06 advisory lock still applies):

| Factor | Formula | Max Impact |
|---|---|---|
| Recency | `exp(−0.693 × days / 180)` — 180d half-life | Fades to 0 over time |
| Disconfirmation | `1 − 0.30 × non_trigger_rate` | −30% at 100% non-trigger |
| Outcome correction | `1 − 0.40 × wrong_rate` | −40% at 100% wrong |

```python
def decay_pattern(pattern, recent_decisions, recent_outcomes, now):
    # F1: Recency — 180d half-life
    recency = exp(-0.693 * (now - pattern.last_seen).days / 180)

    # F2: Disconfirmation
    relevant    = [d for d in recent_decisions if d.category == pattern.category]
    non_triggers = [d for d in relevant if pattern.id not in d.patterns_active]
    disconfirm  = 1 - (0.30 * len(non_triggers) / max(len(relevant), 1))

    # F3: Outcome correction
    recent_90d = [o for o in recent_outcomes if o.date > now - 90days]
    wrong      = [o for o in recent_90d
                  if pattern.type != o.actual_failure_type
                  and pattern.id in o.patterns_injected]
    outcome_corr = 1 - (0.40 * len(wrong) / max(len(recent_90d), 1))

    new_conf = pattern.confidence * recency * disconfirm * outcome_corr

    # Confirmed floor
    if pattern.outcome_confirmation_rate > 0.80:
        new_conf = max(new_conf, 0.40)

    archive_pattern(pattern) if new_conf < 0.15 else update(pattern, new_conf)
```

---

## 7. Pattern Deduplication & Taxonomy

### Merge Rules

| Cosine Similarity | Action | Result |
|---|---|---|
| `> 0.85` | Merge into existing pattern | `count++`, `evidence_ids.append()`, recompute confidence |
| `0.65 – 0.85`, same `failure_type` | Merge into existing | Same as above |
| `0.65 – 0.85`, different `failure_type` | Create child under same theme | New pattern object linked to parent theme |
| `< 0.65` | Create new top-level pattern | Find or create theme via LLM classification |

### Theme Structure — Replaces Flat Array

```json
{
  "theme_id": "<uuid>",
  "theme": "Execution overconfidence",
  "theme_confidence": 0.68,
  "patterns": [
    {
      "pattern_id": "<uuid>",
      "pattern": "Underestimates hiring timeline",
      "type": "assumption",
      "count": 3,
      "confidence": 0.72,
      "severity": "high",
      "embedding": "vector(1536)",
      "evidence_ids": ["<uuid>"],
      "confirmed_by_outcomes": 2,
      "dismissed_at": null,
      "decay_floor": 0.40,
      "typical_missing_variables": ["interview_rounds", "notice_period"]
    }
  ]
}
```

> **Note:** `theme_confidence` = avg of children. `decay_floor` is set if pattern is heavily confirmed.

---

## 8. Pattern → Scoring: Lambda Adjustments

### Pattern Type Mapping

| Pattern Type | Lambda | Direction | Max Adjustment |
|---|---|---|---|
| Underestimates downside/execution | λ2 Downside penalty | Increase | +40% |
| Overestimates revenue/growth | λ4 Upside bonus | Decrease | −40% |
| High historical outcome variance | λ1 Volatility penalty | Increase | +30% |
| Catastrophic tail events in history | λ3 CVaR tail penalty | Increase | +50% |
| Consistently accurate (well-calibrated) | All lambdas | Decrease slightly | −15% |

> All adjustments are **category-scoped**. Cross-category = **0.5× strength**.

### Implementation

```python
def compute_adjusted_lambdas(base, active_patterns, blend_weight, category):
    MAP = {
        'underestimates_downside':   ('lambda2', +1),
        'underestimates_execution':  ('lambda2', +1),
        'overestimates_revenue':     ('lambda4', -1),
        'high_outcome_variance':     ('lambda1', +1),
        'catastrophic_tail_history': ('lambda3', +1),
        'well_calibrated':           ('lambda1', -0.5),
    }
    MAX = {'lambda1': 0.30, 'lambda2': 0.40, 'lambda3': 0.50, 'lambda4': 0.40}

    adj = {k: 0.0 for k in base}
    for p in active_patterns:
        if p.confidence < 0.60:  # BIAS_THRESHOLD
            continue
        if p.category != category:
            if not p.cross_category_applies:
                continue
            mult = 0.5
        else:
            mult = 1.0
        lam, direction = MAP[p.pattern_type]
        adj[lam] += direction * 0.10 * p.confidence * blend_weight * mult

    return {
        k: max(0.05, min(0.90, v * (1 + max(-MAX[k], min(MAX[k], adj[k])))))
        for k, v in base.items()
    }
```

> **Transparency rule:** `explanation.pattern_note` must show:
> 1. Which patterns adjusted lambdas
> 2. The delta
> 3. Scores without adjustment

---

## 9. Testing & Validation Strategy

### Three Validation Levels

| Level | Scope | Metric | Auto Action | Min Data |
|---|---|---|---|---|
| **1 — Pattern Accuracy** | Per pattern | % failures matched pattern type | `accuracy < 0.25` → archive; `> 0.70` → boost conf | 2 outcomes |
| **2 — Score Calibration** | Per user | `mean(\|base−actual\|)` vs `mean(\|adjusted−actual\|)` | `improvement < −0.10` → disable `use_failure_biasing` | 5 decisions w/ outcomes |
| **3 — A/B Test** | Global | Satisfaction score: treatment vs control (t-test) | Alert engineering — **NO auto-disable** | 30 per group |

### Automatic Safeguards

| Condition | Action | Duration |
|---|---|---|
| Pattern accuracy `< 0.25` over ≥5 outcomes | Archive pattern | Permanent — manual review to restore |
| Score calibration improvement `< −0.10` | Disable `use_failure_biasing` for user | Until 10 new outcomes logged |
| A/B test: control group better | Alert engineering | Manual review — never auto-disable |
| Confidence `< 0.15` (decay) | Archive pattern (soft delete) | Permanent |
| Founder dismisses pattern | Stop injecting, mark dismissed | Until confidence rises 20%+ above dismiss point |

### `pattern_injection_log` — New Table

```sql
CREATE TABLE pattern_injection_log (
    log_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id          UUID NOT NULL REFERENCES decisions(decision_id),
    user_id              TEXT NOT NULL,
    blend_weight         FLOAT NOT NULL,
    patterns_considered  UUID[],
    patterns_injected    UUID[],
    patterns_rejected    JSONB,        -- [{pattern_id, reason}]
    lambda_base          JSONB NOT NULL,
    lambda_adjusted      JSONB,        -- null if no adjustment
    experiment_group     TEXT CHECK (experiment_group IN ('control', 'treatment')),
    pass3_injected       BOOL DEFAULT FALSE,
    enrichment_gaps_added INT DEFAULT 0,
    created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON pattern_injection_log (user_id);
CREATE INDEX ON pattern_injection_log (decision_id);
CREATE INDEX ON pattern_injection_log (created_at);
```

---

## 10. Global ↔ Personal Feedback Loop

### Flow

- **Global → Personal:** `aggregate_patterns` serve as priors, weighted by `blend_weight`
- **Personal → Global:** Anonymised signals contribute when `conf > 0.70` and `n_contributors ≥ 5`, max 3 per user per type

### Privacy Gates

| Gate | Value | Purpose |
|---|---|---|
| Min confidence to contribute | `0.70` | Only strongly confirmed patterns contribute to global |
| Outcome must confirm pattern | Required | `pattern.id` must be in `outcome.confirmed_patterns` |
| Max contributions per user | `3 per type+category` | Prevent one user dominating global priors |
| Min contributors before row served | `5` | Privacy — can't reverse-engineer individual from small n |
| Fields stripped before global write | `user_id`, `decision_id`, `assumption_text` | No PII in `aggregate_patterns` |

### Updated `aggregate_patterns` Schema

```json
{
  "pattern_type":           "text",
  "decision_category":      "text",
  "failure_mode":           "text (anonymised pattern text)",
  "hold_rate":              "float",
  "n_samples":              "int",
  "n_contributors":         "int  -- NEW: must be ≥5 before served as prior",
  "severity_distribution":  "jsonb -- NEW: {low, medium, high, critical} percents",
  "cohort_breakdown":       "jsonb -- NEW: {pre_seed, seed, pre_series_a} × {hold_rate, n}",
  "confidence_floor":       "float",
  "last_updated":           "timestamptz"
}
```

### Blending Formula

```python
effective = (personal.confidence * blend_weight
             + global.hold_rate * (1 - blend_weight)
             * stage_relevance)  # 1.0 same cohort, 0.7 different
```

---

## 11. Database Schema Changes

> All changes are **additive only** — no destructive migrations.

| Table | Status | Changes |
|---|---|---|
| `pattern_profiles` | Modified | Replace `patterns[]` with `themes[]`. Add per-pattern: `embedding`, `decay_floor`, `dismissed_at`, `confirmed_by_outcomes`, `typical_missing_variables` |
| `aggregate_patterns` | Modified | Add: `n_contributors`, `severity_distribution`, `cohort_breakdown`, `confidence_floor` |
| `extraction_schemas` | Modified | Add to schema JSONB: `pattern_flags[]`, `pattern_injection_used`. Add to each assumption: `pattern_match_score`, `pattern_id_ref` |
| `decisions` | Modified | Add: `base_score float`, `adjusted_score float`, `experiment_group text` |
| `pattern_injection_log` | **NEW TABLE** | Full audit trail per decision. See [Section 09](#9-testing--validation-strategy). |
| `pattern_contribution_log` | **NEW TABLE** | Tracks user→global contributions for Gate 3 enforcement |

### NOT NULL Additions (run after NULL audit)

```sql
-- Add to existing DB-02 migration:
ALTER TABLE pattern_profiles
    ALTER COLUMN blend_weight SET NOT NULL DEFAULT 0.0;

-- New tables inherit NOT NULL from CREATE statements:
--   pattern_injection_log.decision_id   NOT NULL
--   pattern_injection_log.user_id       NOT NULL
--   pattern_injection_log.blend_weight  NOT NULL
```

---

## 12. Pre-Launch Checklist

All 18 tests are blocking (`YES` = blocks release).

| # | Test | Verify | Blocks? |
|---|---|---|---|
| 1 | Enrichment never writes to `variables[]` | Inject pattern, 0 matching vars → assert `len(variables[])` unchanged | ✅ |
| 2 | Enrichment fire-and-forget on failure | Raise exception in enrichment → assert main flow continues unchanged | ✅ |
| 3 | Max 3 patterns injected | User with 5 patterns all `conf > 0.45` → assert `injection_log.patterns_injected` len ≤ 3 | ✅ |
| 4 | Category scoping | Hiring pattern, pricing decision, `cross_category=False` → assert not injected | ✅ |
| 5 | Lambda adjustments category-scoped | Hiring pattern on pricing decision → assert lambdas unchanged | ✅ |
| 6 | Adjusted lambdas in `[0.05, 0.90]` | Extreme pattern configuration → assert all lambda values in range | ✅ |
| 7 | `pattern_note` in explanation when adjusted | Fire adjustment → assert `explanation.pattern_note` exists | ✅ |
| 8 | `base_score` + `adjusted_score` both stored | After scoring → query decisions table, assert both fields populated | ✅ |
| 9 | Confidence never exceeds `1.0` | All components at max → assert `confidence ≤ 1.0` | ✅ |
| 10 | `count_weight` saturates at `count=5` | `count=5` and `count=10` → assert same `count_weight` value | ✅ |
| 11 | `pattern_injection_log` row per decision | After any extraction+scoring → assert log row exists for `decision_id` | ✅ |
| 12 | Experiment group deterministic | Same `user_id+category` → same group across 100 calls | ✅ |
| 13 | `n_contributors < 5` not served as prior | Insert `aggregate_pattern` `n_contributors=3` → assert `get_global_prior` returns `None` | ✅ |
| 14 | Max 3 global contributions enforced | User with 4 confirmed patterns same `type+category` → assert 4th blocked | ✅ |
| 15 | Decay advisory lock (DB-05) | Two decay tasks simultaneously → assert one logs `'already running'` | ✅ |
| 16 | Confirmed floor prevents over-decay | `outcome_confirmation_rate=0.85`, run decay → assert `confidence ≥ 0.40` | ✅ |
| 17 | Archived patterns not injected | Archive a pattern → run decision → assert not in `injection_log.patterns_injected` | ✅ |
| 18 | Disabled capability respected | Disable `use_failure_biasing` → assert `lambda_adjusted null` in log | ✅ |

---

## 13. Quick Reference — All Constants & Thresholds

| Constant | Value | Used In |
|---|---|---|
| `INJECT_THRESHOLD` | `0.45` | Pass 3 injection, user surfacing |
| `BIAS_THRESHOLD` | `0.60` | Lambda adjustments |
| `PREDICT_THRESHOLD` | `0.75` | Pre-emptive failure flagging |
| `DECAY_FLOOR_GLOBAL` | `0.15` | Archive pattern |
| `DECAY_FLOOR_CONFIRMED` | `0.40` | Min confidence if `outcome_confirm_rate > 0.80` |
| `BLEND_WEIGHT_INJECT` | `0.20` | Activates `use_pattern_injection` |
| `BLEND_WEIGHT_BIAS` | `0.45` | Activates `use_failure_biasing` |
| `BLEND_WEIGHT_PREDICT` | `0.75` | Activates `use_predictive_adjustment` |
| `DEDUP_MERGE_SIM` | `0.85` | Merge as same pattern |
| `DEDUP_THEME_SIM` | `0.65` | Group into same theme |
| `MAX_PATTERNS_INJECTED` | `3` | Pass 3 prompt limit |
| `GLOBAL_MIN_CONTRIBUTORS` | `5` | Before `aggregate_pattern` served as prior |
| `MAX_USER_CONTRIBUTIONS` | `3` | Per user per `type+category` to global |
| `DECAY_HALFLIFE_DAYS` | `180` | Recency decay half-life |
| `CONFIDENCE_HALFLIFE_DAYS` | `90` | Recency component in confidence formula |
| `AB_CONTROL_PCT` | `20` | % decisions in control group |
| `LAMBDA_MAX_ADJ_L1` | `0.30` | Max ± on λ1 volatility |
| `LAMBDA_MAX_ADJ_L2` | `0.40` | Max ± on λ2 downside |
| `LAMBDA_MAX_ADJ_L3` | `0.50` | Max ± on λ3 CVaR |
| `LAMBDA_MAX_ADJ_L4` | `0.40` | Max ± on λ4 upside |
| `IMPORTANCE_BOOST_SIM` | `0.70` | Min cosine sim to boost variable importance |
| `CROSS_CATEGORY_WEIGHT` | `0.50` | Lambda weight for cross-category pattern |
| `BLEND_DECISION_WEIGHT` | `0.40` | Decision signal weight in `blend_weight` formula |
| `BLEND_OUTCOME_WEIGHT` | `0.40` | Outcome signal weight in `blend_weight` formula |
| `BLEND_CONFIDENCE_WEIGHT` | `0.20` | Pattern confidence weight in `blend_weight` formula |
