# Eidoz Memory Layer — Engineer Reference
**v1.5 · Internal · Do not distribute**

> Pull this doc when you are building. Everything here is a decision, a schema, a code block, or a checklist item. Skip the full spec PDF unless you need the legal or architectural rationale behind something.

---

## Contents
1. [Storage Tables — Quick Reference](#1-storage-tables--quick-reference)
2. [SQL Migrations — Run in Order](#2-sql-migrations--run-in-order)
3. [Embedding Model & Build String](#3-embedding-model--build-string)
4. [Retrieval Service](#4-retrieval-service)
5. [Category Similarity Matrix](#5-category-similarity-matrix)
6. [Pattern Profiles — Optimistic Locking & Decay Cron](#6-pattern-profiles--optimistic-locking--decay-cron)
7. [aggregate_patterns — Prompt Injection Template](#7-aggregate_patterns--prompt-injection-template)
8. [Cold-Start Extraction — Prompt Differences](#8-cold-start-extraction--prompt-differences)
9. [Feedback Loops — What to Log and Where](#9-feedback-loops--what-to-log-and-where)
10. [GDPR Erasure Cascade](#10-gdpr-erasure-cascade)
11. [Consent & User Rights Endpoints](#11-consent--user-rights-endpoints)
12. [Data Breach Register](#12-data-breach-register)
13. [Celery Beat Schedule](#13-celery-beat-schedule)
14. [Implementation Checklist — Phase by Phase](#14-implementation-checklist--phase-by-phase)
15. [Quality Gates & SLOs](#15-quality-gates--slos)

---

## 1. Storage Tables — Quick Reference

| Table | Written by | Read by | Optimistic lock? | New in v1.5? |
|---|---|---|---|---|
| `decisions` | Extraction pipeline (single tx) | Failure Analysis, Memory retrieval, Dashboard | No | No |
| `extraction_schemas` | Extraction pipeline | Retrieval, Failure Analysis | No | No |
| `simulation_runs` | Simulation Engine (async Celery) | Scoring Engine | No | No |
| `scores` | Scoring Engine | Dashboard, Anomaly job | No | No |
| `memory_index` | Memory indexer (post-validation) | Retrieval service | No | No |
| `pattern_profiles` | Failure Analysis Step 4 | Pressure Test, Dashboard | **YES — version INT** | No |
| `assumption_outcomes` | Failure Analysis Step 3 | Aggregation job, Dashboard | No | **Yes** |
| `causal_model_cache` | Simulation Engine | Simulation Engine | No | **Yes** |
| `aggregate_patterns` | Nightly aggregation job | Enrichment prompt, Dashboard | No | **Yes** |
| `stage_transitions` | User settings / inference job | Retrieval service | No | **Yes** |
| `right_panel_cache` | Celery async task | Frontend | No | **Yes** |
| `right_panel_feedback` | User interaction event | Monthly optimisation job | No | **Yes** |
| `retrieval_outcome_log` | After each extraction | Weekly analysis job | No | **Yes** |
| `retrieval_miss_log` | Retrieval service (threshold miss) | Analysis | No | **Yes** |
| `deletion_audit_log` | GDPR erasure cascade | Audit / DPA inspection | No | **Yes** |
| `consent_records` | Signup + consent update events | Rights endpoints | No | **Yes** |
| `consent_audit_log` | Every consent change | Audit | No | **Yes** |
| `profiling_objections` | Art. 21 objection endpoint | Pressure Test, Aggregation job | No | **Yes** |
| `breach_register` | Manual / incident response | Legal / Compliance | No | **Yes** |

**Memory indexing quality gates** — only index schemas that pass ALL of:
- `overall_confidence >= 0.70`
- `len(variables) >= 3`
- `validation_passes <= 2`
- `consistency_score >= 0.75`

**Pattern surfacing threshold:** `confidence >= 0.55` (equivalent to count = 4 with k=3 prior)

---

## 2. SQL Migrations — Run in Order

> Run all migrations after core tables (`decisions`, `extraction_schemas`, `simulation_runs`, `scores`, `outcomes`, `failure_analyses`, `pattern_profiles`, `right_panel_cache`). Use alembic or flyway.

```sql
-- Migration 0
CREATE EXTENSION IF NOT EXISTS vector;

-- Migration 1 — alter existing tables
ALTER TABLE memory_index
  ADD COLUMN IF NOT EXISTS embedding_template_version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS domain_volatility TEXT DEFAULT 'stable'
    CHECK (domain_volatility IN ('stable','moderate','high')),
  ADD COLUMN IF NOT EXISTS stage TEXT;

-- WARNING: only run this on a fresh install or after a full re-embedding job
-- ALTER TABLE memory_index ALTER COLUMN embedding TYPE VECTOR(3072);

CREATE INDEX IF NOT EXISTS memory_index_embedding_idx
  ON memory_index USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE pattern_profiles ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE extraction_schemas ADD COLUMN IF NOT EXISTS cold_start BOOLEAN DEFAULT FALSE;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS anomaly_flag BOOLEAN DEFAULT FALSE;

-- Migration 2 — causal_model_cache
CREATE TABLE IF NOT EXISTS causal_model_cache (
  cache_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_category       TEXT NOT NULL,
  variable_signature_hash TEXT NOT NULL,
  dag_structure           JSONB NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT now(),
  hit_count               INT DEFAULT 0,
  UNIQUE(decision_category, variable_signature_hash)
);
CREATE INDEX ON causal_model_cache (decision_category);

-- Migration 3 — assumption_outcomes
CREATE TABLE IF NOT EXISTS assumption_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id     UUID REFERENCES decisions(decision_id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  assumption_text TEXT NOT NULL,
  assumption_type TEXT CHECK (assumption_type IN ('factual','causal','market','execution')),
  held            BOOLEAN,   -- NULL until user returns with outcome
  gap_severity    TEXT CHECK (gap_severity IN ('minor','significant','total')),
  failure_type    TEXT,
  logged_at       TIMESTAMPTZ
);
CREATE INDEX ON assumption_outcomes (user_id);
CREATE INDEX ON assumption_outcomes (decision_id);

-- Migration 4 — aggregate_patterns
CREATE TABLE IF NOT EXISTS aggregate_patterns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_category TEXT NOT NULL,
  assumption_type   TEXT NOT NULL,
  hold_rate         FLOAT NOT NULL CHECK (hold_rate BETWEEN 0 AND 1),
  n_samples         INT NOT NULL CHECK (n_samples >= 1),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(decision_category, assumption_type)
);

-- Migration 5 — stage_transitions
CREATE TABLE IF NOT EXISTS stage_transitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  from_stage      TEXT CHECK (from_stage IN ('pre-seed','seed','pre-series-a')),
  to_stage        TEXT NOT NULL CHECK (to_stage IN ('pre-seed','seed','pre-series-a','series-a')),
  transitioned_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON stage_transitions (user_id);

-- Migration 6 — right_panel_feedback
CREATE TABLE IF NOT EXISTS right_panel_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id   UUID REFERENCES right_panel_cache(panel_id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('bias','weak_assumption','suggestion')),
  item_text  TEXT NOT NULL,
  user_acted BOOLEAN NOT NULL DEFAULT FALSE,
  logged_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON right_panel_feedback (panel_id);
CREATE INDEX ON right_panel_feedback (item_type, user_acted);

-- Migration 7 — retrieval_outcome_log
CREATE TABLE IF NOT EXISTS retrieval_outcome_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_extraction_id      UUID,
  retrieved_extraction_ids UUID[],
  extraction_confidence    FLOAT,
  confidence_delta         FLOAT,
  logged_at                TIMESTAMPTZ DEFAULT now()
);

-- Migration 8 — deletion_audit_log
-- DO NOT add a user_id FK — this table must survive account deletion
CREATE TABLE IF NOT EXISTS deletion_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_hash    TEXT NOT NULL,   -- SHA-256 of user_id
  deleted_at      TIMESTAMPTZ DEFAULT now(),
  tables_affected TEXT[] NOT NULL,
  requested_by    TEXT DEFAULT 'user'
);

-- Migration 9 — retrieval_miss_log
CREATE TABLE IF NOT EXISTS retrieval_miss_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  decision_category TEXT NOT NULL,
  query_excerpt     TEXT,
  best_cosine_seen  FLOAT,
  logged_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON retrieval_miss_log (user_id);
CREATE INDEX ON retrieval_miss_log (decision_category);

-- Migration v1.4-A — consent_records
CREATE TABLE IF NOT EXISTS consent_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  consent_type    TEXT NOT NULL CHECK (consent_type IN (
                    'core_processing','behavioral_profiling',
                    'cross_user_learning','marketing','research_publication'
                  )),
  given           BOOLEAN NOT NULL DEFAULT FALSE,
  given_at        TIMESTAMPTZ,
  withdrawn_at    TIMESTAMPTZ,
  consent_version TEXT NOT NULL,
  ip_address_hash TEXT,
  UNIQUE(user_id, consent_type)
);
CREATE INDEX ON consent_records (user_id);

-- Migration v1.4-B — consent_audit_log
-- Never add ON DELETE CASCADE — this table is an immutable audit trail
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  consent_type    TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('given','withdrawn','updated')),
  consent_version TEXT NOT NULL,
  actioned_at     TIMESTAMPTZ DEFAULT now()
);

-- Migration v1.4-C — profiling_objections (Art. 21)
CREATE TABLE IF NOT EXISTS profiling_objections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL UNIQUE,
  objected_at TIMESTAMPTZ DEFAULT now(),
  reason      TEXT
);
-- When row exists for a user:
--   pattern_profiles updates SUSPENDED
--   pressure test receives empty user_patterns
--   aggregate_patterns job EXCLUDES this user's assumption_outcomes

-- Migration v1.4-D — breach_register
CREATE TABLE IF NOT EXISTS breach_register (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at         TIMESTAMPTZ NOT NULL,
  detected_by         TEXT NOT NULL,
  breach_type         TEXT NOT NULL CHECK (breach_type IN (
                        'confidentiality','integrity','availability','combined'
                      )),
  data_types_affected TEXT[] NOT NULL,
  users_affected_est  INT,
  risk_level          TEXT CHECK (risk_level IN ('low','medium','high')),
  dpa_notified        BOOLEAN DEFAULT FALSE,
  dpa_notified_at     TIMESTAMPTZ,
  users_notified      BOOLEAN DEFAULT FALSE,
  users_notified_at   TIMESTAMPTZ,
  remediation_steps   TEXT,
  closed_at           TIMESTAMPTZ,
  notes               TEXT
);
```

---

## 3. Embedding Model & Build String

**Model:** `text-embedding-3-large` (3072 dims). Do not use `text-embedding-3-small`.

```python
def build_embedding_string(schema: dict) -> str:
    top_vars = sorted(
        schema["variables"],
        key=lambda v: {"critical":0,"high":1,"medium":2,"low":3}[v["importance"]]
    )[:3]
    top_risks = sorted(
        schema["risks"],
        key=lambda r: {"high":0,"medium":1,"low":2}[r["severity"]]
    )[:2]
    return (
        f"[{schema['decision_category']}] "
        f"{schema['decision']} "
        f"Variables: {', '.join(v['name'] for v in top_vars)}. "
        f"Risks: {', '.join(r['description'][:60] for r in top_risks)}. "
        f"Constraints: {'; '.join(c['description'] for c in schema['constraints'][:2])}"
    )
```

> When the template changes, increment `embedding_template_version` on all new rows and trigger a re-embedding job for existing rows. Never mix template versions in active retrieval.

---

## 4. Retrieval Service

**Threshold guard is not optional.** Without it, a low-quality match injects bad few-shot context into extraction, which silently degrades all 5 downstream engines.

```python
MIN_COSINE = 0.72

def get_similar_schemas(new_schema: dict, user_stage: str, db) -> list:
    query_embedding = embed(build_embedding_string(new_schema))

    # Step 1 — hard threshold filter
    candidates = db.query(
        """SELECT *, (embedding <-> %s) AS distance
           FROM memory_index
           WHERE 1 - (embedding <-> %s) >= %s""",  -- cosine similarity floor
        [query_embedding, query_embedding, MIN_COSINE]
    )

    if not candidates:
        log_retrieval_miss(new_schema["decision_category"], query_embedding, db)
        return []   # extraction runs cold — no few-shot injection

    # Step 2 — hybrid score
    def hybrid_score(record):
        semantic  = 1 - record["distance"]
        category  = get_category_similarity(
                        new_schema["decision_category"], record["decision_category"])
        recency   = recency_decay(record["created_at"], record["domain_volatility"])
        stage_mult = 3.0 if record["stage"] == user_stage else 1.0
        return (0.6 * semantic + 0.3 * category + 0.1 * recency) * stage_mult

    ranked = sorted(candidates, key=hybrid_score, reverse=True)
    return ranked[:3]


def log_retrieval_miss(decision_category: str, query_embedding, db):
    db.execute(
        """INSERT INTO retrieval_miss_log
           (user_id, decision_category, query_excerpt, best_cosine_seen, logged_at)
           VALUES (%s, %s, %s, %s, now())""",
        [g.user_id, decision_category, "...", 0.0]  # fill best_cosine_seen from candidates
    )


def recency_decay(created_at, domain_volatility: str) -> float:
    days_old = (datetime.utcnow() - created_at).days
    if domain_volatility == "stable":
        return 1.0
    elif domain_volatility == "moderate":
        return 0.5 ** (days_old / 180)   # half-life 6 months
    elif domain_volatility == "high":
        return 0.5 ** (days_old / 90)    # half-life 3 months
    return 1.0
```

---

## 5. Category Similarity Matrix

**Decision:** this is a direct code input. You cannot write the retrieval scorer without it.

**8 categories for v1:** `hiring`, `pricing`, `product`, `fundraise`, `gtm`, `ops`, `legal`, `other`

```python
category_similarity_matrix = {
    "hiring":    {"hiring":1.0, "pricing":0.2, "product":0.4, "fundraise":0.3,
                  "gtm":0.3,    "ops":0.5,     "legal":0.4,   "other":0.1},
    "pricing":   {"hiring":0.2, "pricing":1.0, "product":0.5, "fundraise":0.4,
                  "gtm":0.6,    "ops":0.2,     "legal":0.2,   "other":0.1},
    "product":   {"hiring":0.4, "pricing":0.5, "product":1.0, "fundraise":0.3,
                  "gtm":0.5,    "ops":0.3,     "legal":0.2,   "other":0.1},
    "fundraise": {"hiring":0.3, "pricing":0.4, "product":0.3, "fundraise":1.0,
                  "gtm":0.3,    "ops":0.2,     "legal":0.5,   "other":0.1},
    "gtm":       {"hiring":0.3, "pricing":0.6, "product":0.5, "fundraise":0.3,
                  "gtm":1.0,    "ops":0.3,     "legal":0.2,   "other":0.1},
    "ops":       {"hiring":0.5, "pricing":0.2, "product":0.3, "fundraise":0.2,
                  "gtm":0.3,    "ops":1.0,     "legal":0.3,   "other":0.1},
    "legal":     {"hiring":0.4, "pricing":0.2, "product":0.2, "fundraise":0.5,
                  "gtm":0.2,    "ops":0.3,     "legal":1.0,   "other":0.1},
    "other":     {"hiring":0.1, "pricing":0.1, "product":0.1, "fundraise":0.1,
                  "gtm":0.1,    "ops":0.1,     "legal":0.1,   "other":1.0},
}

def get_category_similarity(cat1: str, cat2: str) -> float:
    if cat1 == cat2:
        return 1.0
    return category_similarity_matrix.get(cat1, {}).get(cat2, 0.1)
    # Unknown pairs default to 0.1 — weak signal, not zero
```

> Do not tune values until Loop 3 (`retrieval_outcome_log`) has produced 500+ decisions per category pair. The starter values are calibrated — don't guess-adjust them early.

---

## 6. Pattern Profiles — Optimistic Locking & Decay Cron

### Optimistic locking — every write

```python
def update_pattern_profile(user_id: str, new_patterns: list, db) -> bool:
    row = db.query(
        "SELECT version FROM pattern_profiles WHERE user_id = %s", [user_id]
    )
    current_version = row[0]["version"] if row else 0

    rows_updated = db.execute(
        """UPDATE pattern_profiles
           SET patterns = %s, updated_at = now(), version = version + 1
           WHERE user_id = %s AND version = %s""",
        [json.dumps(new_patterns), user_id, current_version]
    )
    if rows_updated == 0:
        log.warning(f"Optimistic lock conflict for user {user_id} — retry or skip")
        return False
    return True
```

### Pattern confidence formula

```python
# confidence = count / (count + k) where k = 3
# Surface only when confidence >= 0.55

PRIOR_STRENGTH     = 3
SURFACE_THRESHOLD  = 0.55
DECAY_START_DAYS   = 180
DECAY_PER_MONTH    = 0.10

def compute_confidence(count: int, last_confirmed: datetime) -> float:
    raw = count / (count + PRIOR_STRENGTH)
    days_since = (datetime.utcnow() - last_confirmed).days
    if days_since > DECAY_START_DAYS:
        months_decaying = (days_since - DECAY_START_DAYS) / 30
        raw = max(0.0, raw - DECAY_PER_MONTH * months_decaying)
    return round(raw, 4)
```

### Decay cron job (Celery, nightly at 02:00 UTC)

```python
BATCH_SIZE = 100

@celery.task
def run_pattern_decay():
    now = datetime.utcnow()
    offset = 0

    while True:
        users = db.query(
            "SELECT user_id, patterns, version FROM pattern_profiles "
            "ORDER BY user_id LIMIT %s OFFSET %s",
            [BATCH_SIZE, offset]
        )
        if not users:
            break

        for user in users:
            patterns = user["patterns"]
            changed  = False

            for p in patterns:
                last_confirmed = datetime.fromisoformat(p["last_confirmed"])
                new_confidence = compute_confidence(p["count"], last_confirmed)

                if abs(new_confidence - p.get("confidence", 9)) > 0.001:
                    p["confidence"] = new_confidence
                    if new_confidence <= 0.0:
                        p["count"] = 0   # fully decayed — reset count
                    changed = True

            if changed:
                rows = db.execute(
                    """UPDATE pattern_profiles
                       SET patterns = %s, updated_at = now(), version = version + 1
                       WHERE user_id = %s AND version = %s""",
                    [json.dumps(patterns), user["user_id"], user["version"]]
                )
                if rows == 0:
                    log.warning(f"Decay: lock conflict for {user['user_id']} — skipped")

        offset += BATCH_SIZE
    log.info(f"Pattern decay complete — {offset} users processed")
```

### Read path for Pressure Test Engine

```python
def get_active_patterns(user_id: str, db) -> list:
    row = db.query(
        "SELECT patterns FROM pattern_profiles WHERE user_id = %s", [user_id]
    )
    if not row:
        return []
    return [
        p for p in row[0]["patterns"]
        if p.get("confidence", p["count"] / (p["count"] + 3)) >= SURFACE_THRESHOLD
        and p["count"] > 0
    ]
    # Fallback expression handles patterns created after last cron run (not yet decayed)
    # New patterns have count 1-2 → confidence 0.25-0.40 → always below threshold → safe
```

---

## 7. aggregate_patterns — Prompt Injection Template

```python
def build_domain_prior_block(decision_category: str, db) -> str:
    rows = db.query(
        """SELECT assumption_type, hold_rate, n_samples
           FROM aggregate_patterns
           WHERE decision_category = %s AND n_samples >= 5
           ORDER BY hold_rate ASC""",    -- most fragile first
        [decision_category]
    )
    if not rows:
        return ""   # omit block entirely — never inject an empty header

    lines = ["DOMAIN PRIORS — BASE RATES FROM SIMILAR DECISIONS:"]
    lines.append(
        f"Across {sum(r['n_samples'] for r in rows)} similar "
        f"'{decision_category}' decisions made by other founders on this platform:"
    )
    for row in rows:
        if row["hold_rate"] < 0.40:
            fragility = "HIGH FRAGILITY"
        elif row["hold_rate"] < 0.65:
            fragility = "MODERATE FRAGILITY"
        else:
            fragility = "LOW FRAGILITY"
        lines.append(
            f"  - {row['assumption_type'].replace('_',' ').title()} assumptions: "
            f"held {row['hold_rate']*100:.0f}% of the time "
            f"(n={row['n_samples']}) [{fragility}]"
        )
    lines.append(
        "Use these base rates to adjust fragility scores on extracted assumptions of each type. "
        "Do not override the schema — only adjust fragility where the base rate suggests "
        "the founder's assumption is systematically optimistic."
    )
    return "\n".join(lines)


# Slot into Enrichment system prompt:
system_prompt = f"""
{existing_enrichment_system_prompt}

{build_domain_prior_block(schema['decision_category'], db)}
""".strip()
```

**Guardrails:**
- `n_samples >= 5` is enforced at DB query level — no row below 5 ever reaches the prompt
- Return `""` on empty result and `strip()` the system prompt — LLM never sees an empty block header
- Query is scoped to `decision_category` only — no cross-category contamination
- Instruction says "do not override schema" — LLM adjusts fragility only, never variable values

---

## 8. Cold-Start Extraction — Prompt Differences

When `get_similar_schemas()` returns `[]`, extraction must use different prompts. Do not pass an empty list — it confuses the model.

| Component | Normal run | Cold-start run |
|---|---|---|
| Pass 1 system prompt | Includes `{schemas}` few-shot block | **Omit few-shot block entirely** |
| Pass 2 system prompt | Includes reference variable structures | Use domain_prior variables only |
| Enrichment layer | Cross-links against retrieved schemas | Use `aggregate_patterns` priors only (if n_samples ≥ 5) |
| `extraction_schemas` write | `cold_start = FALSE` | **`cold_start = TRUE`** |
| Logging | Normal | Write to `retrieval_miss_log` |

```python
def run_extraction(schema_input: dict, user_id: str, user_stage: str, db):
    retrieved = get_similar_schemas(schema_input, user_stage, db)
    is_cold_start = len(retrieved) == 0

    pass1_prompt = build_pass1_prompt(schema_input, retrieved)   # handles empty list internally
    pass2_prompt = build_pass2_prompt(schema_input, retrieved)
    enrich_prompt = build_enrichment_prompt(
        schema_input, retrieved,
        domain_priors=build_domain_prior_block(schema_input["decision_category"], db)
    )

    # ... run passes ...

    db.execute(
        "UPDATE extraction_schemas SET cold_start = %s WHERE extraction_id = %s",
        [is_cold_start, extraction_id]
    )
```

---

## 9. Feedback Loops — What to Log and Where

### Loop 1 — Assumption base rates (nightly, 03:00 UTC)

```sql
INSERT INTO aggregate_patterns (decision_category, assumption_type, hold_rate, n_samples, updated_at)
SELECT d.decision_category, ao.assumption_type,
       AVG(ao.held::int) AS hold_rate, COUNT(*) AS n_samples, now()
FROM assumption_outcomes ao
JOIN decisions d ON d.decision_id = ao.decision_id
WHERE ao.held IS NOT NULL
GROUP BY d.decision_category, ao.assumption_type HAVING COUNT(*) >= 5
ON CONFLICT (decision_category, assumption_type)
DO UPDATE SET hold_rate  = EXCLUDED.hold_rate,
              n_samples  = EXCLUDED.n_samples,
              updated_at = now();
```

### Loop 2 — Right panel feedback (user interaction → frontend event)

```python
# Log on every panel item interaction (thumbs up or down)
db.execute(
    """INSERT INTO right_panel_feedback
       (panel_id, item_type, item_text, user_acted, logged_at)
       VALUES (%s, %s, %s, %s, now())""",
    [panel_id, item_type, item_text, user_acted]
)

# Monthly optimisation query — flag items to prune from bias detection prompt
SELECT item_type, item_text,
       1 - AVG(user_acted::int) AS ignore_rate,
       COUNT(*) AS exposures
FROM right_panel_feedback
GROUP BY item_type, item_text
HAVING COUNT(*) >= 20
ORDER BY ignore_rate DESC;
-- Items with ignore_rate > 0.85 → remove from bias detection prompt
```

### Loop 3 — Retrieval quality (after each extraction)

```python
db.execute(
    """INSERT INTO retrieval_outcome_log
       (query_extraction_id, retrieved_extraction_ids,
        extraction_confidence, confidence_delta, logged_at)
       VALUES (%s, %s, %s, %s - %s, now())""",
    [extraction_id, retrieved_ids, new_confidence, new_confidence, cold_start_baseline]
)
```

Weekly analysis — paste into psql:
```sql
SELECT d.decision_category, AVG(confidence_delta) AS avg_lift, COUNT(*) AS n
FROM retrieval_outcome_log rol
JOIN extraction_schemas es ON es.extraction_id = rol.query_extraction_id
JOIN decisions d ON d.decision_id = es.decision_id
GROUP BY d.decision_category ORDER BY avg_lift DESC;
-- Categories with avg_lift < 0: reduce their weight in category_similarity_matrix
```

### Loop 4 — Score anomaly detection (TimescaleDB, background job)

```sql
SELECT decision_id, confidence,
  (confidence - AVG(confidence) OVER w) / NULLIF(STDDEV(confidence) OVER w, 0) AS z_score
FROM scores WHERE user_id = $1
WINDOW w AS (PARTITION BY user_id ORDER BY created_at ROWS 6 PRECEDING);

UPDATE scores SET anomaly_flag = true
WHERE decision_id = $2 AND ABS(z_score) > 2;
```

---

## 10. GDPR Erasure Cascade

**Run as a single transaction. Do not split.**

```sql
BEGIN;

DELETE FROM right_panel_feedback
  WHERE panel_id IN (
    SELECT panel_id FROM right_panel_cache
    WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1));

DELETE FROM right_panel_cache
  WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1);

DELETE FROM failure_analyses
  WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1);

DELETE FROM assumption_outcomes WHERE user_id = $1;

DELETE FROM outcomes
  WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1);

DELETE FROM scores
  WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1);

DELETE FROM simulation_runs
  WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1);

DELETE FROM memory_index
  WHERE extraction_id IN (
    SELECT extraction_id FROM extraction_schemas
    WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1));

DELETE FROM extraction_schemas
  WHERE decision_id IN (SELECT decision_id FROM decisions WHERE user_id = $1);

DELETE FROM pattern_profiles WHERE user_id = $1;
DELETE FROM stage_transitions WHERE user_id = $1;
DELETE FROM profiling_objections WHERE user_id = $1;

UPDATE consent_records
  SET withdrawn_at = now() WHERE user_id = $1 AND withdrawn_at IS NULL;

DELETE FROM decisions WHERE user_id = $1;

INSERT INTO deletion_audit_log (user_id_hash, deleted_at, tables_affected, requested_by)
VALUES (
  encode(sha256($1::bytea), 'hex'),
  now(),
  ARRAY['decisions','extraction_schemas','memory_index','pattern_profiles',
        'simulation_runs','scores','assumption_outcomes','stage_transitions',
        'right_panel_cache','right_panel_feedback','failure_analyses',
        'outcomes','profiling_objections','consent_records'],
  'user'
);

COMMIT;
```

> After any DB restore: re-query `deletion_audit_log` and re-run the cascade for any user whose `deleted_at` predates the backup snapshot.

**What is NOT deleted and why:**
| Table | Kept | Reason |
|---|---|---|
| `aggregate_patterns` | Yes — permanently | Fully anonymised, no user_id, n_samples ≥ 5 |
| `deletion_audit_log` | Yes — 6 years | Legal compliance obligation |
| `consent_audit_log` | Yes — 6 years | Immutable audit trail |
| `breach_register` | Yes — permanently | Legal/operational record |
| DB backups | Yes — 30-90 days | Normal rotation window, inaccessible, never restore deleted user |

---

## 11. Consent & User Rights Endpoints

### API endpoints to implement

| Method | Endpoint | What it does | Deadline |
|---|---|---|---|
| `GET` | `/api/v1/user/{id}/export` | Full data export — all tables, typed JSON (Art. 15 + Art. 20) | 30 days |
| `PATCH` | `/api/v1/user/{id}/profile` | Rectify profile fields (Art. 16) | 30 days |
| `PATCH` | `/api/v1/decisions/{id}` | Rectify decision content, triggers re-embedding | 30 days |
| `POST` | `/api/v1/user/{id}/restrict` | Set `processing_restricted = TRUE`, freeze all processing (Art. 18) | Without undue delay |
| `POST` | `/api/v1/user/{id}/object-to-profiling` | Insert into `profiling_objections`, suspends pattern updates (Art. 21) | Without undue delay |
| `DELETE` | `/api/v1/user/{id}` | Triggers full erasure cascade (Art. 17) | 30 days |
| `POST` | `/api/v1/user/{id}/consent` | Update consent_records + write consent_audit_log | Immediate |

### Consent types

```python
CONSENT_TYPES = [
    "core_processing",       # required to use the service
    "behavioral_profiling",  # pattern_profiles — must be opt-in, service works without it
    "cross_user_learning",   # data feeds aggregate_patterns
    "marketing",
    "research_publication",
]
```

### Art. 21 — when profiling_objections row exists

```python
def get_pressure_test_context(user_id: str, db) -> dict:
    objection = db.query(
        "SELECT 1 FROM profiling_objections WHERE user_id = %s", [user_id]
    )
    if objection:
        return {"user_patterns": []}   # first-run mode only, no pattern targeting
    return {"user_patterns": get_active_patterns(user_id, db)}
```

### Art. 18 — processing_restricted flag

When `processing_restricted = TRUE` on a user:
- Skip memory indexing
- Skip `pattern_profiles` updates
- Skip right-panel generation
- Serve decisions from frozen state only
- Do **not** delete data — freeze it in place

---

## 12. Data Breach Register

Log every incident — even ones that don't require DPA notification.

```python
def log_breach(detected_by: str, breach_type: str,
               data_types: list, risk_level: str, db):
    breach_id = db.execute(
        """INSERT INTO breach_register
           (detected_at, detected_by, breach_type, data_types_affected, risk_level)
           VALUES (now(), %s, %s, %s, %s)
           RETURNING id""",
        [detected_by, breach_type, data_types, risk_level]
    )
    return breach_id

def mark_dpa_notified(breach_id: str, db):
    db.execute(
        "UPDATE breach_register SET dpa_notified = TRUE, dpa_notified_at = now() WHERE id = %s",
        [breach_id]
    )
```

**72-hour clock starts at `detected_at`. DPA must be notified within 72h if risk_level = medium or high.**

Supervisory authorities:
- Ireland (EU HQ): Data Protection Commission — forms.dataprotection.ie
- UK: ICO — ico.org.uk/make-a-complaint/data-security-concerns
- India: MeitY — rules still being finalised

---

## 13. Celery Beat Schedule

```python
# celery_config.py
from celery.schedules import crontab

CELERYBEAT_SCHEDULE = {
    "pattern-decay-nightly": {
        "task":     "tasks.pattern_decay_job.run_pattern_decay",
        "schedule": crontab(hour=2, minute=0),   # 02:00 UTC
    },
    "aggregate-patterns-nightly": {
        "task":     "tasks.aggregate_patterns_job.run_aggregation",
        "schedule": crontab(hour=3, minute=0),   # 03:00 UTC — after decay job
    },
    "retrieval-quality-weekly": {
        "task":     "tasks.retrieval_quality_job.run_analysis",
        "schedule": crontab(day_of_week=1, hour=4, minute=0),   # Monday 04:00 UTC
    },
    "score-anomaly-detection": {
        "task":     "tasks.score_anomaly_job.run_detection",
        "schedule": crontab(hour=5, minute=0),   # 05:00 UTC — Phase 4 only
    },
}
# Pattern decay must run BEFORE aggregate-patterns.
# Both are nightly. Stagger by 1h to avoid table contention.
```

---

## 14. Implementation Checklist — Phase by Phase

### Phase 1 — Foundation (8-12 days) — build before anything else

- [ ] Run all SQL migrations (0–9 + v1.4-A through v1.4-D) on staging, verify FK constraints, promote to production
- [ ] Upgrade `memory_index.embedding` to `VECTOR(3072)` — fresh install only, or run re-embedding job first
- [ ] Implement `build_embedding_string()` with `embedding_template_version` tracking
- [ ] Set `MIN_COSINE = 0.72` in retrieval service; log cold-start to `retrieval_miss_log`; set `cold_start = TRUE` on `extraction_schemas`
- [ ] Add `version INT` to `pattern_profiles`; implement optimistic locking on **every** UPDATE
- [ ] Wire `category_similarity_matrix` (Section 5) into retrieval scorer — replace any binary category match
- [ ] Write GDPR erasure cascade as a single stored procedure; test on staging with all FKs enforced; verify `deletion_audit_log` row survives
- [ ] Build data export endpoint `GET /api/v1/user/{id}/export` — all tables, typed JSON
- [ ] Set up `consent_records` write path at signup
- [ ] Sign DPAs + SCCs with OpenAI, Anthropic, hosting provider, Stripe before first EU user

### Phase 2 — Retrieval & Injection (6-8 days)

- [ ] Implement `recency_decay()` with `domain_volatility` from `memory_index`
- [ ] Add stage-weighted scoring: same-stage schemas score 3×; wire `stage_transitions` into retrieval
- [ ] Build `causal_model_cache` read/write with SHA-256 hash deduplication
- [ ] Wire `aggregate_patterns` into Enrichment prompt using `build_domain_prior_block()` (Section 7)
- [ ] Build cold-start prompt variants for Pass 1, Pass 2, Enrichment (Section 8)
- [ ] Implement `Art. 21` objection endpoint + `profiling_objections` table gate in pressure test

### Phase 3 — Feedback Loops (6-8 days)

- [ ] Implement `assumption_outcomes` write path in Failure Analysis Step 3
- [ ] Build nightly aggregation job (Loop 1) — Celery task at 03:00 UTC
- [ ] Add `right_panel_feedback` write path to frontend — thumbs on each panel item
- [ ] Build monthly ignore_rate analysis query; process results into prompt update
- [ ] Implement `retrieval_outcome_log` write path after each extraction (Loop 3)
- [ ] Build `stage_transitions` inference job or manual update endpoint
- [ ] Deploy pattern decay cron job at 02:00 UTC (Section 6)

### Phase 4 — Scale (no hard deadline)

- [ ] Score anomaly detection — rolling z-score TimescaleDB job, surface in dashboard
- [ ] Bayesian weight updating from `assumption_outcomes` hold rates
- [ ] Re-embedding job on `embedding_template_version` bump
- [ ] Annual GDPR compliance review against all tables and sub-processors

---

## 15. Quality Gates & SLOs

| Component | Target | P95 budget | Notes |
|---|---|---|---|
| Extraction success rate | > 95% | — | Hard errors, not re-extractions |
| Schema passes validation first try | > 85% | — | Re-extraction max 2 attempts |
| Memory retrieval latency | < 500ms | — | Including hybrid score computation |
| Extraction P95 latency | < 15s | 20s | Full 3-pass + validate + enrich |
| Simulation job completion | < 10s | 15s | 10k Monte Carlo, async Celery |
| Cold-start rate per category | Monitor | — | Log via `retrieval_miss_log`; target decreasing over time |
| Pattern decay job completion | < 10 min | — | For up to 10,000 users; alert on failure |
| Aggregation job completion | < 5 min | — | Alert on failure — blocks domain priors |
| Overall extraction confidence | > 0.75 median | — | `overall_confidence` field across all extractions |
| memory_index quality gate | 100% enforced | — | confidence ≥ 0.70, variables ≥ 3, passes ≤ 2, consistency ≥ 0.75 |

**Alert on:**
- Pattern decay job failure (silent — no decay = patterns never expire)
- Aggregation job failure (domain priors go stale)
- `retrieval_miss_log` rate spiking above 40% for any category (index too sparse)
- `extraction_schemas.cold_start` rate above 60% for any user (index not growing fast enough)

---

*Engineer reference extracted from Eidoz Memory Layer Architecture & GDPR Spec v1.5. For legal rationale, compliance details, and architectural decisions behind these specs, see the full PDF.*
