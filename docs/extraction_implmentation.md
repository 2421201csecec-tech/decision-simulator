# Extraction Layer — Engineer Implementation Guide v1.1

> **Decision Intelligence Platform · Confidential · For Engineering Team**
>
> Bridges spec v1.1 to a concrete, sequenced build plan.
> Covers: spec audit, file structure, build sequence, integration contracts, testing.

| | |
|---|---|
| Sections in spec | 14 |
| Validation rules | 18 |
| LLM passes | 3 |
| Error codes | 7 |
| QA gates | 12 |

---

## Contents

1. [Spec Audit](#1-spec-audit)
2. [Decisions You Need to Make Before Build Starts](#2-decisions-before-build-starts)
3. [Recommended File & Module Structure](#3-file--module-structure)
4. [Build Sequence — Sprint by Sprint](#4-build-sequence)
5. [Pass-by-Pass Implementation Guide](#5-pass-by-pass-implementation-guide)
6. [Schema Validation Engine](#6-schema-validation-engine)
7. [Enrichment Layer](#7-enrichment-layer)
8. [Consistency Engine (DAG)](#8-consistency-engine-dag)
9. [Memory Write](#9-memory-write)
10. [Downstream Engine Connections](#10-downstream-engine-connections)
11. [Testing Strategy & Golden Test Set](#11-testing-strategy--golden-test-set)
12. [Observability Wiring](#12-observability-wiring)
13. [Environment Variables & Config](#13-environment-variables--config)
14. [Common Mistakes to Avoid](#14-common-mistakes-to-avoid)

---

## 1. Spec Audit

> What the engineer got right, what needs a decision, and what is missing.

The engineer's refined spec (v1.1) is technically strong. The pipeline structure, validation framework, Pydantic model, and telemetry design are all production-quality. Read this before writing a single line of code — some items require a product decision before build.

**Legend**

| Badge | Meaning |
|---|---|
| `APPROVED` | Adopt as written, no changes needed |
| `CHANGE` | Adopt with a specific modification listed below |
| `NEW` | Engineer added something not in the original spec — confirm you want it |
| `CONFIRM` | Product decision required before engineer proceeds |

### Section-by-Section Verdict

| Decision | Status |
|---|---|
| 3-pass pipeline structure (Pass 1 intent, Pass 2 variables, Pass 3 risks) | `APPROVED` |
| Max 2 retries per pass with injected error context | `APPROVED` |
| VariableV1 schema — all 16 fields | `APPROVED` |
| `variable_id` as stable machine key (separate from name) | `NEW` |
| `affects[]` must reference `variable_id`, not name — downstream join policy | `NEW` |
| HARD/SOFT validation split and 18 rules | `APPROVED` |
| V010: DAG acyclic check as HARD gate | `APPROVED` |
| V009: broken `affects[]` edge = SOFT if low-importance variable | `NEW` |
| Confidence calibration formula (5-factor weighted sum) | `CONFIRM` |
| Clarification turn before terminal fail (Section 8) | `NEW` |
| Enrichment: never overwrite `source=explicit` fields | `APPROVED` |
| Enrichment audit record with `field_path`, `before`, `after`, `reason` | `APPROVED` |
| Typed constraint schema with `constraint_id`, `operator`, `target` | `NEW` |
| `action_variable_map` output from enrichment | `CHANGE` |
| Error code model — 7 codes with HTTP status and retryable flag | `APPROVED` |
| Telemetry fields per-pass (latency, tokens, prompt version) | `APPROVED` |
| SLO targets — 6 SLOs listed | `APPROVED` |
| QA acceptance checklist — 12 gates | `APPROVED` |
| Pydantic model sketch (Appendix A) | `APPROVED` |
| Right panel async output is NOT in scope | `CONFIRM` |

---

### Detailed Notes on Non-APPROVED Items

#### `NEW` — `variable_id` as Stable Machine Key

The engineer added `variable_id` (prefixed `var_`, e.g. `var_mrr_growth`) as a stable machine key separate from `name`. This is a genuine improvement. **Adopt it.** All downstream engines (simulation DAG builder, scoring weight mapper, failure analysis) should join on `variable_id`, never `name`. Update all downstream contracts to use `variable_id`.

**Actions for engineer:**
- Add `variable_id` to the `VariableV1` Pydantic model (already in spec, just confirm)
- Update `affects[]` to hold `variable_id` strings, not `name` strings
- Update `constraint.target` to hold `variable_id`, not `name`
- Document this in the downstream engine data contracts section

---

#### `NEW` — V009: Broken `affects[]` Edge is SOFT if Low-Importance Variable

A missing dependency edge on a low or medium importance variable should not block the whole pipeline. **Adopt as written.** For critical and high importance variables, keep it HARD.

---

#### `CONFIRM` — Confidence Calibration Formula

The engineer defined a specific 5-factor formula:

```
confidence = 0.35 * evidence_strength
           + 0.20 * type_clarity
           + 0.20 * range_clarity
           + 0.15 * dependency_clarity
           + 0.10 * constraint_alignment
```

This was not in the original architecture. Two options:

- **Option A (recommended for MVP):** Accept as written. Lock in v1.1, revisit after 50+ decisions.
- **Option B (defer complexity):** Simplify to a 3-level rubric — `explicit=0.90`, `inferred=0.70`, `domain_prior=0.60`.

> **Recommendation:** Take Option A — the engineer already has it written. Ship it. Calibrate later. The formula must produce identical results for identical inputs — no randomness.

---

#### `NEW` — Clarification Turn Before Terminal Fail (Section 8)

If HARD rules still fail after 2 retries, ask the user one specific question before returning a terminal error:

> *"I'm missing one critical detail to structure this decision: `{missing_field}`. Please provide it in one sentence."*

This is a good UX addition — it prevents silent failures on edge-case inputs. **Adopt it.**

**Implementation requirements:**
- `POST /extract` returns `409` with `clarification_question` field
- Client stores partial extraction state keyed by `session_id`
- Re-call `POST /extract` with original input + user answer + `session_id`
- Extraction service retrieves session state and re-runs only the failed pass

---

#### `NEW` — Typed Constraint Schema

The engineer upgraded the constraint object from a simple string + `is_hard` flag to a fully typed schema with `constraint_id`, `operator`, `target` (`variable_id`), `value`, and `unit`. **Adopt it.** The simulation engine will need it to enforce constraints programmatically.

---

#### `CHANGE` — `action_variable_map` Missing from Enrichment Output

This field is **critical** for the simulation engine. It maps each action to the specific values or ranges its key variables take under that action. Without it, the simulation cannot set up different causal paths per option.

```json
"action_variable_map": {
  "a1": {"var_mrr_growth": 0.15, "var_team_size": 5, "var_burn_rate": 0.85},
  "a2": {"var_mrr_growth": 0.12, "var_team_size": 3, "var_burn_rate": 0.65}
}
```

Add this to the enrichment output and the `ExtractionV1_1` contract.

---

#### `CONFIRM` — Right Panel Scope

The right panel (bias detection, weak assumptions, suggestions) is out of scope for the extraction layer. It is a separate Celery background task that reads the completed extraction schema — it does not modify it and is not part of the `/extract` endpoint response.

---

## 2. Decisions Before Build Starts

> These must be answered before the engineer writes code — not during.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Confidence formula | A) 5-factor weighted sum · B) 3-level rubric | **Option A** — already written, ship it, calibrate later |
| 2 | Clarification turn (409 flow)? | A) Yes — adds UX step · B) No — fail silently | **Yes** — prevents user frustration. Needs client state. |
| 3 | Who owns `variable_id` generation? | A) LLM generates strings · B) Backend hashes name | **Backend.** LLM outputs `name` only. |
| 4 | `action_variable_map` in v1.1 or deferred? | A) Required now · B) Defer to v1.2 | **Required now.** Simulation engine cannot run without it. |
| 5 | Right panel: confirm it is a separate service | A) Part of `/extract` · B) Separate Celery task | **Separate service.** `/extract` should never be blocked by it. |
| 6 | Memory write: sync or async? | A) Sync · B) Async (fire and forget) | **Async.** Memory write failure must not fail the extraction. |
| 7 | Golden test set size before ship | A) 12 (min) · B) 50 (spec recommends) | **12 for MVP.** Expand to 50 before opening to real users. |

---

## 3. File & Module Structure

One module per responsibility. Each component is independently testable and replaceable.

```
extraction/
├── __init__.py
├── api.py                    # FastAPI router — POST /extract only
├── pipeline.py               # Orchestrator: calls passes in order, handles retries
├── schemas.py                # Pydantic models: VariableV1, ExtractionV1_1, ConstraintV1
│
├── passes/
│   ├── __init__.py
│   ├── pass1_intent.py       # Pass 1: decision, actions, actors, constraints
│   ├── pass2_variables.py    # Pass 2: variables[] with full VariableV1 schema
│   └── pass3_risks.py        # Pass 3: assumptions, risks, hidden_deps
│
├── validation/
│   ├── __init__.py
│   ├── validator.py          # HARD/SOFT rule engine — all 18 rules
│   ├── rules.py              # One function per rule (V001–V018)
│   └── result.py             # ValidationResult dataclass
│
├── enrichment/
│   ├── __init__.py
│   ├── enricher.py           # LLM enrichment call + action_variable_map
│   └── provenance.py         # EnrichmentAuditRecord model + writer
│
├── consistency/
│   ├── __init__.py
│   ├── dag.py                # Build DAG from affects[], cycle detection
│   └── checker.py            # Run all consistency checks, return ConsistencyReport
│
├── memory/
│   ├── __init__.py
│   ├── writer.py             # Async write to PostgreSQL + pgvector index
│   └── retriever.py          # Hybrid retrieval: vector + category + recency
│
├── prompts/
│   ├── pass1_v1.1.0.txt      # Versioned prompt files — never hardcode in Python
│   ├── pass2_v1.1.0.txt
│   ├── pass3_v1.1.0.txt
│   └── enrichment_v1.1.0.txt
│
├── telemetry/
│   ├── __init__.py
│   └── emitter.py            # Emit per-pass telemetry to Langfuse/logging
│
└── tests/
    ├── unit/
    │   ├── test_validator.py  # One test per validation rule
    │   ├── test_dag.py        # Cycle detection tests
    │   └── test_enricher.py   # Enrichment guardrail tests
    ├── integration/
    │   └── test_pipeline.py   # Full pipeline end-to-end with mock LLM
    └── golden/
        ├── inputs/            # 12+ plain-text decision inputs
        ├── expected/          # Expected ExtractionV1_1 JSON for each input
        └── test_golden.py     # Compares actual output to expected
```

> **Key principle:** `prompts/` is a directory, not strings in code. Every prompt is a versioned `.txt` file. Version is in the filename: `pass1_v1.1.0.txt`. This makes prompt changes auditable via Git without touching Python code. Telemetry must record which prompt version was used for every extraction.

---

## 4. Build Sequence

> Build strictly in this order. Do not start the next milestone until the current one passes its acceptance tests. The pipeline orchestrator is the **last** thing you wire together — not the first.

### Milestone 1 — Schemas & Validation Engine (Week 1–2)

**Deliverable:** `schemas.py` is complete. `validator.py` passes all 18 rule unit tests. No LLM calls yet.

| Task | File | Done when |
|---|---|---|
| Write `VariableV1` Pydantic model with all 16 fields + validators | `schemas.py` | pytest passes on 20 valid + 10 invalid variable objects |
| Write `ExtractionV1_1` model (full output contract) | `schemas.py` | Model serialises to valid JSON matching spec |
| Write `ConstraintV1` model with operator, target, value | `schemas.py` | pytest passes on 5 constraint objects |
| Implement all 18 validation rules (V001–V018) | `validation/rules.py` | One test per rule, HARD/SOFT behaviour confirmed |
| Implement `ValidationResult` dataclass | `validation/result.py` | Contains `hard_errors[]`, `soft_fixes[]`, `warnings[]` |
| Wire all rules into `validator.py` | `validation/validator.py` | `validate(schema)` returns `ValidationResult` correctly |
| Write `variable_id` generator (backend owns this) | `schemas.py` | `generate_variable_id("mrr_growth")` → `"var_mrr_growth"` |

### Milestone 2 — Three LLM Passes (Week 2–4)

**Deliverable:** Each pass runs independently and returns parseable output. Not yet wired together.

| Task | File | Done when |
|---|---|---|
| Write versioned prompt files for each pass | `prompts/` | All 4 `.txt` files committed. No prompt strings in Python. |
| Write `pass1_intent.py` — LLM call + JSON parse + basic shape check | `passes/pass1_intent.py` | Returns dict matching Pass 1 field list. Handles malformed JSON. |
| Write `pass2_variables.py` — LLM call + parse each variable + inject `variable_id` | `passes/pass2_variables.py` | Returns list of `VariableV1` objects with `variable_id` generated by backend |
| Write `pass3_risks.py` — LLM call + parse assumptions, risks, hidden_deps | `passes/pass3_risks.py` | Returns valid risk/assumption arrays |
| Write retry wrapper — injects error context on retry | `pipeline.py` | On `ValidationError`: formats failed rules, appends to next prompt |
| Write per-pass telemetry emission | `telemetry/emitter.py` | Latency, tokens, model, prompt version logged per call |

### Milestone 3 — Enrichment + Consistency + DAG (Week 4–5)

**Deliverable:** Enrichment runs on validated schema. DAG is built and cycle-checked. `action_variable_map` present.

| Task | File | Done when |
|---|---|---|
| Write enrichment prompt (versioned `.txt`) | `prompts/` | Includes `action_variable_map` instruction |
| Write `enricher.py` — LLM call, parse, apply non-destructively | `enrichment/enricher.py` | Never overwrites `source=explicit` fields |
| Write `provenance.py` — `EnrichmentAuditRecord` model + append-only log | `enrichment/provenance.py` | Each mutation recorded with `field_path`, `before`, `after` |
| Write `dag.py` — build directed graph from `affects[]` using `variable_id` | `consistency/dag.py` | NetworkX DiGraph. DFS cycle detection. |
| Write `checker.py` — run all consistency checks | `consistency/checker.py` | Returns `ConsistencyReport` with cycles, conflicts |
| V018 implementation: contradictory hard constraints | `validation/rules.py` | Two constraints that cannot be satisfied simultaneously |
| Clarification turn logic — return 409 with question | `pipeline.py` | After 2 retries of a HARD-failed pass, format question and return |

### Milestone 4 — Memory Write + Full Pipeline (Week 5–6)

**Deliverable:** `POST /extract` works end-to-end. Output is stored. Golden test set passes.

| Task | File | Done when |
|---|---|---|
| Write `writer.py` — async PostgreSQL write + pgvector index | `memory/writer.py` | Fire-and-forget. Failure does not affect `/extract` response. |
| Write `retriever.py` — hybrid retrieval for memory injection | `memory/retriever.py` | Returns top-3 similar schemas |
| Wire full pipeline in `pipeline.py` | `pipeline.py` | Input → P1 → P2 → P3 → Validate → Enrich → Consistency → Memory |
| Write `api.py` — `POST /extract` with request/response models | `api.py` | Returns `ExtractionV1_1` on success, error payload on failure |
| Write golden test suite (12 inputs minimum) | `tests/golden/` | All 12 pass. Confidence ≥ 0.70 on all. No HARD failures. |
| Load and soak test | `tests/` | P95 latency < 15s on 20 sequential `/extract` calls |

---

## 5. Pass-by-Pass Implementation Guide

### How All Three Passes Are Structured Identically

Every pass follows the same pattern. The only things that differ are the extraction targets, the system prompt, and which validation rules trigger a retry.

```python
def run_pass_N(user_input, prior_schema, memory_context, error_context=None):
    prompt = load_prompt(f"passN_v{PROMPT_VERSION}.txt")
    filled = prompt.format(
        user_input=user_input,
        prior_schema=json.dumps(prior_schema, indent=2),
        memory_context=format_memory(memory_context),
        error_context=error_context or ""  # empty on first attempt
    )
    start = time.monotonic()
    raw = call_llm(filled, temperature=0.1, max_tokens=PASS_N_MAX_TOKENS)
    latency_ms = int((time.monotonic() - start) * 1000)
    emit_telemetry(pass=N, latency_ms=latency_ms, raw=raw)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise PassParseError(f"Pass {N} returned invalid JSON")

    return parsed  # caller runs validation and retries if needed
```

---

### Pass 1 — Intent & Scope

Receives raw user input + memory context. Returns the decision frame.

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | string | Yes | One sentence. Not a question. |
| `decision_category` | enum | Yes | `hiring\|product\|strategy\|financial\|ops\|other` |
| `actions` | object[] | Yes | 2–6 items: `{action_id, label, is_baseline}` |
| `actors` | string[] | Yes | Names/roles only at this stage |
| `time_horizon` | string | Yes | ISO 8601 duration or plain phrase |
| `constraints` | object[] | Yes | Use full `ConstraintV1` schema |
| `success_criteria` | string[] | No | What a good outcome looks like |

**Key prompt instructions:**
- `actions[]` must be mutually exclusive choices, not implementation steps
- If user describes only one option, infer "maintain current state" as `action_1`
- Constraints must use full `ConstraintV1` schema (`constraint_id`, `operator`, `target`, `value`)
- Return JSON only — no preamble, no markdown, no explanation

---

### Pass 2 — Variables

Receives Pass 1 schema + user input + memory. Returns `variables[]` array. Backend injects `variable_id` after parsing.

```
SYSTEM:
Extract ALL variables that affect which action produces the best outcome.
Return ONLY JSON: {"variables": [...]}
For each variable, output name only (NOT variable_id — the backend generates IDs).
Aim for 5-12 variables. Fewer is fine for simple decisions.
DO NOT create two variables for the same concept.
("execution_quality" AND "delivery_quality" = same thing. Pick one.)

CONFIDENCE RUBRIC (use this exactly):
  0.90+ = user explicitly stated this variable and its range
  0.70-0.89 = clearly implied by context
  0.50-0.69 = logically required but not mentioned
  <0.50 = domain standard — flag for enrichment

AFFECTS[] RULE: list the names of variables this one causally influences.
Backend will translate names to variable_ids after parsing.
```

---

### Pass 3 — Risks & Assumptions

Receives full P1+P2 schema. Returns `assumptions[]`, `risks[]`, `hidden_deps[]`, `known_unknowns[]`.

```
SYSTEM:
You are a senior startup consultant identifying what could go wrong.
Ground every risk and assumption in the SPECIFIC decision context.

BANNED outputs (too generic to be useful):
- "Market conditions may change"
- "Competition could increase"
- "Execution may be harder than expected"

REQUIRED output style:
- "Assumes the hiring pipeline can close in 4 weeks — hiring for this role
   typically takes 8-12 weeks in the current market" (specific, falsifiable)
- "Revenue growth rate assumed at 15%/month — actual median for this stage
   is 8-10%; model is 1.5x optimistic" (quantified)

For hidden_deps: what external factors could block any action that the
founder has not mentioned? Focus on legal, people, and capital dependencies.
```

---

## 6. Schema Validation Engine

> The validator is entirely programmatic — no LLM calls. It is the fastest component in the pipeline (~10ms). Every rule is a separate function in `rules.py`. Run ALL rules before returning — do not short-circuit on first failure.

```python
# validation/validator.py
from validation.rules import HARD_RULES, SOFT_RULES
from validation.result import ValidationResult

class SchemaValidator:
    def validate(self, schema: dict) -> ValidationResult:
        hard_errors, soft_fixes, warnings = [], [], []

        for rule_id, rule_fn in HARD_RULES.items():
            result = rule_fn(schema)
            if not result.passed:
                hard_errors.append({
                    "rule_id": rule_id,
                    "message": result.message,
                    "re_run_pass": result.re_run_pass,
                    "field": result.field,
                })

        for rule_id, rule_fn in SOFT_RULES.items():
            result = rule_fn(schema)
            if not result.passed:
                schema = result.repaired_schema  # apply auto-fix in-place
                soft_fixes.append({
                    "rule_id": rule_id,
                    "field": result.field,
                    "fix_applied": result.fix_description,
                })

        return ValidationResult(
            passed=len(hard_errors) == 0,
            hard_errors=hard_errors,
            soft_fixes=soft_fixes,
            warnings=warnings,
            schema=schema,  # schema after soft fixes applied
        )

    def get_error_context(self, result: ValidationResult) -> str:
        """Formats hard errors for injection into retry prompt."""
        lines = ["PREVIOUS ATTEMPT FAILED THESE VALIDATION RULES:"]
        for e in result.hard_errors:
            lines.append(f"- {e['rule_id']}: {e['message']}")
        lines.append("Fix these specific issues. Do not change anything else.")
        return "\n".join(lines)

    def get_passes_to_rerun(self, result: ValidationResult) -> set[int]:
        return {e["re_run_pass"] for e in result.hard_errors}
```

### Example Rule Implementations

```python
# validation/rules.py

def V001_decision_nonempty(schema) -> RuleResult:
    ok = bool(schema.get("decision", "").strip())
    return RuleResult(passed=ok, rule_id="V001",
                      message="decision field is empty or missing",
                      re_run_pass=1, field="decision")


def V006_continuous_range_valid(schema) -> RuleResult:
    for var in schema.get("variables", []):
        if var.get("type") in ("continuous", "ordinal"):
            r = var.get("range")
            if not r or len(r) != 2 or r[0] >= r[1]:
                return RuleResult(passed=False, rule_id="V006",
                                  message=f"Variable '{var.get('name')}': range invalid. Got {r}",
                                  re_run_pass=2, field=f"variables[name={var.get('name')}].range")
    return RuleResult(passed=True, rule_id="V006")


def V010_dag_acyclic(schema) -> RuleResult:
    """Build DiGraph, run DFS cycle detection. HARD gate."""
    import networkx as nx
    G = nx.DiGraph()
    for var in schema.get("variables", []):
        for target_id in var.get("affects", []):
            G.add_edge(var["variable_id"], target_id)
    cycles = list(nx.simple_cycles(G))
    if cycles:
        cycle_str = " -> ".join(cycles[0])
        return RuleResult(passed=False, rule_id="V010",
                          message=f"DAG cycle detected: {cycle_str}",
                          re_run_pass=2, field="variables[].affects")
    return RuleResult(passed=True, rule_id="V010")


def V011_default_value_in_domain(schema) -> RuleResult:
    """SOFT — auto-clamp default_value to midpoint if out of range."""
    for var in schema.get("variables", []):
        if var.get("type") == "continuous":
            r = var.get("range", [0, 1])
            dv = var.get("default_value")
            if dv is not None and not (r[0] <= dv <= r[1]):
                var["default_value"] = (r[0] + r[1]) / 2  # clamp
    return RuleResult(passed=True, rule_id="V011",
                      fix_description="default_value clamped to midpoint")
```

---

## 7. Enrichment Layer

> Non-destructive gap-filling with full provenance tracking. **Golden rule: never overwrite `source=explicit`.** If enrichment fails, the pre-enrichment schema passes through unchanged with `enrichment_applied=false`.

```python
# enrichment/enricher.py
class Enricher:
    def enrich(self, schema: dict, user_input: str,
               memory_schemas: list) -> tuple[dict, list[AuditRecord]]:
        prompt = load_prompt(f"enrichment_v{PROMPT_VERSION}.txt").format(
            validated_schema=json.dumps(schema, indent=2),
            user_input=user_input,
            memory_schemas=json.dumps(memory_schemas[:3], indent=2),
        )
        try:
            raw = call_llm(prompt, temperature=0.2, max_tokens=2500)
            enriched = json.loads(raw)
        except Exception as e:
            log.warning(f"Enrichment failed: {e}")
            return schema, []  # non-blocking — pass through unchanged

        enriched, audit = self._apply_non_destructive(schema, enriched)
        return enriched, audit

    def _apply_non_destructive(self, original, enriched):
        """Only accept changes where original field was not source=explicit."""
        audit = []
        for i, orig_var in enumerate(original.get("variables", [])):
            if orig_var.get("source") == "explicit":
                enriched["variables"][i] = orig_var  # restore original
                continue
            enr_var = enriched["variables"][i]
            for field in enr_var:
                if enr_var[field] != orig_var.get(field):
                    audit.append(AuditRecord(
                        field_path=f"variables[{i}].{field}",
                        before=orig_var.get(field),
                        after=enr_var[field],
                        source="inferred",
                        reason="enrichment gap-fill",
                    ))
        return enriched, audit
```

**Three things the enrichment prompt must explicitly request:**
1. `action_variable_map`: `{action_id: {variable_id: value_or_midpoint}}` for all critical/high vars
2. For each variable with `extraction_confidence < 0.60`: attempt to improve confidence
3. Add up to 3 `domain_prior` variables missing from schema (must be marked non-blocking)

---

## 8. Consistency Engine (DAG)

> Fully programmatic. Builds a NetworkX DiGraph, runs cycle detection, checks constraint feasibility, and verifies temporal consistency. Outputs a `ConsistencyReport` attached to the schema — does **not** modify the schema itself.

```python
# consistency/dag.py
import networkx as nx

def build_dag(variables: list[dict]) -> nx.DiGraph:
    G = nx.DiGraph()
    for var in variables:
        G.add_node(var["variable_id"], **{
            "name": var["name"],
            "importance": var["importance"],
            "observability": var["observability"],
        })
        for target_id in var.get("affects", []):
            G.add_edge(var["variable_id"], target_id)
    return G

def check_cycles(G: nx.DiGraph) -> list[list[str]]:
    return list(nx.simple_cycles(G))

def check_temporal_consistency(G: nx.DiGraph, variables: list[dict]) -> list[str]:
    """A terminal variable cannot affect a realtime variable (causally impossible)."""
    warnings = []
    obs = {v["variable_id"]: v["observability"] for v in variables}
    for u, v in G.edges():
        if obs.get(u) == "terminal" and obs.get(v) == "realtime":
            warnings.append(
                f"Temporal inconsistency: terminal var {u} cannot affect realtime var {v}"
            )
    return warnings

def check_constraint_feasibility(constraints, variables) -> list[str]:
    """Check if any action can satisfy all is_hard=True constraints simultaneously."""
    hard = [c for c in constraints if c.get("is_hard")]
    issues = []
    targets = {}
    for c in hard:
        t = c.get("target")
        targets.setdefault(t, []).append(c)
    for target, cons in targets.items():
        for i in range(len(cons)):
            for j in range(i+1, len(cons)):
                if _contradicts(cons[i], cons[j]):
                    issues.append(
                        f"Contradictory constraints on {target}: "
                        f"{cons[i]['operator']} {cons[i]['value']} "
                        f"AND {cons[j]['operator']} {cons[j]['value']}"
                    )
    return issues

def _contradicts(c1, c2) -> bool:
    if c1["type"] != "numeric" or c2["type"] != "numeric": return False
    if c1["operator"] == ">=" and c2["operator"] == "<=" and c1["value"] > c2["value"]:
        return True
    if c1["operator"] == "<=" and c2["operator"] == ">=" and c1["value"] < c2["value"]:
        return True
    return False
```

---

## 9. Memory Write

> Async indexing so past decisions improve future extractions.

```python
# memory/writer.py
import asyncio
from celery import shared_task

STORAGE_CRITERIA = {
    "min_confidence": 0.70,
    "max_validation_passes": 2,
    "min_variables": 3,
    "min_consistency_score": 0.75,
}

def should_store(schema: dict) -> bool:
    c = schema.get("confidence", {})
    v = schema.get("validation", {})
    return (
        c.get("overall_confidence", 0) >= STORAGE_CRITERIA["min_confidence"]
        and v.get("retry_count", 0) <= STORAGE_CRITERIA["max_validation_passes"]
        and len(schema.get("variables", [])) >= STORAGE_CRITERIA["min_variables"]
    )

@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def write_to_memory_async(self, schema: dict):
    """Celery task — fire and forget from pipeline."""
    try:
        _write_to_postgres(schema)
        _write_to_vector_index(schema)
    except Exception as exc:
        raise self.retry(exc=exc)

# In pipeline.py — fire and forget
if should_store(final_schema):
    write_to_memory_async.delay(final_schema)
# Pipeline continues immediately — does not await
```

---

## 10. Downstream Engine Connections

> If the extraction layer changes any field name, type, or nesting, the corresponding downstream team **must** be notified before ship.

| Downstream Engine | Fields It Reads | What It Does | Critical Dependency |
|---|---|---|---|
| **Pressure Test Engine** | `assumptions[]`, `risks[]`, `hidden_deps[]`, `known_unknowns[]`, `decision_category` | Generates scenarios targeting high-fragility assumptions and high-severity risks | `assumptions[].fragility` must be populated. `hidden_deps[]` must be non-empty for strategic decisions. |
| **Simulation Engine** | `variables[]` (all fields), `action_variable_map`, `actions[]`, `constraints[]` | Builds causal DAG from `affects[]`. Sets variable values per action. | `action_variable_map` is mandatory. Variable ranges must be set. |
| **Scoring Engine** | `variables[].importance`, `variables[].direction`, `actions[]`, `decision_category` | Maps importance to utility weights. Uses direction to orient the score. | `direction` must be set on all variables. `importance` required. |
| **Failure Analysis** | `assumptions[]`, `constraints[]`, `variables[].controlled_by`, `decision`, `actions[]` | Compares original assumptions to reality assumption-by-assumption. | Full decision snapshot must be stored. `controlled_by` needed for attribution. |
| **Right Panel (async)** | `assumptions[].fragility`, `known_unknowns[]`, `decision`, `decision_category` | Generates bias analysis, weak assumption flags, suggestions. | Reads only — never writes back to schema. Failures are non-blocking. |

---

## 11. Testing Strategy & Golden Test Set

### Three Test Layers

| Layer | What It Tests | Mocks LLM? | Run On |
|---|---|---|---|
| Unit tests | Each validation rule (V001–V018), DAG builder, enrichment guardrails, `variable_id` generator | Yes | Every commit (fast, <10s) |
| Integration tests | Full pipeline with real LLM but controlled inputs. Verify schema shape, field presence, HARD rule enforcement. | No | PR merge gate (<3min) |
| Golden tests | Fixed input → expected output comparison. Tests structure and quality (confidence, variable count). | No | Pre-release gate |

### Mandatory Golden Test Inputs (12 minimum)

| # | Decision Type | Min Variables | Min Confidence | Key Check |
|---|---|---|---|---|
| 1 | Hire cofounder vs stay solo | 5 | 0.75 | Variables include `equity_dilution`, `execution_quality` |
| 2 | Raise seed round now vs in 6 months | 6 | 0.75 | Constraints include runway duration |
| 3 | Build vs buy a core feature | 4 | 0.72 | `action_variable_map` populated for both actions |
| 4 | Fire an underperforming employee | 4 | 0.70 | `assumptions[]` non-empty, fragility set |
| 5 | Enter a new market (geography) | 7 | 0.75 | `hidden_deps[]` includes regulatory/legal |
| 6 | Pivot product vs stay the course | 8 | 0.72 | `known_unknowns[]` populated |
| 7 | Price increase (SaaS product) | 5 | 0.75 | All actions have `action_variable_map` entries |
| 8 | Offshore vs keep local engineering | 6 | 0.72 | `time_horizon` extracted correctly |
| 9 | Acquire a small competitor | 8 | 0.70 | Constraints include capital constraint |
| 10 | Short vague input: "should I hire?" | 3 | 0.62 | Clarification turn triggers OR passes with low confidence |
| 11 | Input with contradictory hard constraints | 3 | 0.65 | V018 triggers. `ConsistencyReport` flags contradiction. |
| 12 | Input with 6+ variables having circular deps | 6 | 0.65 | V010 triggers. DAG cycle detected and reported. |

### Golden Test Evaluation

```python
def evaluate_golden(actual: dict, expected: dict, threshold: dict) -> bool:
    checks = [
        # Structure
        actual["validation"]["hard_passed"] == True,
        len(actual["variables"]) >= threshold["min_variables"],
        actual["confidence"]["overall_confidence"] >= threshold["min_confidence"],
        # Fields present
        all(v.get("variable_id") for v in actual["variables"]),
        all(v.get("direction") for v in actual["variables"]),
        all(v.get("affects") is not None for v in actual["variables"]),
        # action_variable_map populated
        "action_variable_map" in actual,
        len(actual["action_variable_map"]) == len(actual["actions"]),
        # No HARD failures
        actual["validation"]["rule_failures"] == [],
        # Telemetry present
        "pass_latencies_ms" in actual["telemetry"],
    ]
    return all(checks)
```

---

## 12. Observability Wiring

> Each pass is a separate Langfuse span, making per-pass latency visible in the dashboard.

```python
# telemetry/emitter.py
from langfuse import Langfuse

langfuse = Langfuse()  # reads LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY from env

def trace_extraction(extraction_id: str, user_id_hash: str):
    return langfuse.trace(
        name="extraction",
        id=extraction_id,
        user_id=user_id_hash,
        metadata={"schema_version": "1.1.0"},
    )

def span_pass(trace, pass_num: int, model: str, prompt_version: str):
    return trace.span(
        name=f"pass{pass_num}",
        metadata={"model": model, "prompt_version": prompt_version},
    )

# Usage in passes/pass1_intent.py:
def run_pass1(user_input, prior_schema, memory_context, trace, error_context=None):
    with span_pass(trace, 1, MODEL_PRIMARY, PROMPT_VERSION) as span:
        start = time.monotonic()
        raw = call_llm(...)
        span.update(output=raw, metadata={
            "latency_ms": int((time.monotonic()-start)*1000),
            "tokens_in": count_tokens(filled),
            "tokens_out": count_tokens(raw),
            "retry": error_context is not None,
            "cost_usd": estimate_cost(tokens_in, tokens_out),
        })
    return parsed
```

### Dashboard Alerts — Wire on Day 1

| Alert | Threshold | Severity | Action |
|---|---|---|---|
| P95 `/extract` latency | > 15s | WARNING | Check LLM provider latency; consider fallback |
| Hard validation fail rate | > 15% | WARNING | Review recent input patterns; prompt may need update |
| DAG cycle rate | > 2% | WARNING | Review Pass 2 prompt `affects[]` instruction clarity |
| Clarification-required rate | > 10% | INFO | Consider adding examples to prompts for common vague inputs |
| Overall confidence median | < 0.70 | WARNING | Confidence degrading; review enrichment prompt |
| LLM primary error rate | > 5% | CRITICAL | Trigger fallback model automatically |
| Memory write fail rate | > 10% | WARNING | Memory layer degraded; extractions still succeed |

---

## 13. Environment Variables & Config

```bash
# .env.example — Extraction Layer

# LLM
ANTHROPIC_API_KEY=sk-ant-...           # Primary: claude-sonnet-4-20250514
OPENAI_API_KEY=sk-...                  # Fallback: gpt-4o-mini
LLM_PRIMARY_MODEL=claude-sonnet-4-20250514
LLM_FALLBACK_MODEL=gpt-4o-mini
LLM_TIMEOUT_SECONDS=25                 # Per-pass timeout. P95 budget = 15s total.

# Prompt versioning
PROMPT_VERSION=1.1.0                   # Loaded from prompts/pass1_v{PROMPT_VERSION}.txt
PROMPT_DIR=./prompts

# Database
DATABASE_URL=postgresql://user:pass@host:5432/decisions
REDIS_URL=redis://host:6379/0          # Celery broker

# Vector / Embeddings
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
PGVECTOR_TABLE=memory_index

# Extraction config
MAX_RETRIES_PER_PASS=2
MIN_VARIABLES_THRESHOLD=3
MIN_CONFIDENCE_FOR_STORAGE=0.70
MAX_VARIABLES_ALLOWED=15
CLARIFICATION_ENABLED=true             # Set false to skip 409 flow in tests

# Observability
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
LOG_LEVEL=INFO

# Feature flags
ENRICHMENT_ENABLED=true
MEMORY_WRITE_ENABLED=true
RIGHT_PANEL_ENABLED=false              # Right panel is a separate service — not here
```

---

## 14. Common Mistakes to Avoid

| Mistake | Why It Fails | Correct Approach |
|---|---|---|
| Hardcoding prompts as Python strings | Prompt changes require code deploys. No audit trail. Cannot diff in Git cleanly. | Load prompts from versioned `.txt` files. Filename includes prompt version. |
| LLM generates `variable_id` | LLM will generate inconsistent IDs: `"var_mrr"`, `"var_mrr_growth"`, `"var_MRRgrowth"`. Downstream joins break. | Backend generates `variable_id = "var_" + name.lower().replace(" ", "_")` |
| Short-circuiting validation on first failure | You get one error at a time. Retry injects only that error. Second run fails on a different rule. 3rd retry needed. | Run ALL rules before returning. Collect all failures. Inject all of them on retry. |
| Enrichment that overwrites explicit values | User said "runway = 14 months". Enrichment sets it to 12 (domain prior). Trust is broken. | Check `source` field before any write. If `source="explicit"`, skip entirely. |
| Awaiting memory write in the request path | `/extract` blocks for 200–800ms extra waiting for Postgres + pgvector. P95 latency blows out. | Fire Celery task and return immediately. Memory write is non-blocking. |
| Missing `action_variable_map` from enrichment output | Simulation engine cannot build different causal paths per action. Scores collapse to the same number. | Make it an explicit requirement in the enrichment prompt. Validate its presence. |
| Storing low-confidence schemas in memory | Future extractions get bad few-shot examples. Quality degrades over time (poisoned index). | Check `should_store()` before every memory write. Minimum confidence: 0.70. |
| Not versioning prompts in telemetry | A prompt change causes extraction quality to change. You cannot tell which extraction used which prompt. | Emit `prompt_version` per pass to Langfuse. It is in the telemetry span metadata. |
| Right panel code inside the `/extract` handler | Any failure or slowdown in bias detection blocks the main extraction response. | Right panel is a separate Celery task. It reads the completed schema — never blocks `/extract`. |

---

## Final Notes

The spec is excellent. The architecture is sound. The main gaps are:

1. **Add `action_variable_map` to enrichment output** — simulation cannot run without it
2. **Confirm `variable_id` ownership** — backend generates, LLM outputs `name` only
3. **Get product sign-off on clarification turn (409 flow)** before building it

Everything else: build in milestone order, test as you go, ship Milestone 4 first.

---

*This document should be read alongside: Extraction Layer Spec v1.1, Master Architecture PDF, and Decision Scoring Engine Spec.*
