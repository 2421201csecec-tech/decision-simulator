# Decision Intelligence Platform
## Master Architecture & Engineering Specification · v1.0

**Complete System Loop — All Engines, All Layers**

How Extraction, Simulation, Scoring, Failure Analysis, and Memory work together as a single learning loop — for startup founders.

| 5 Engines | 3 LLM Passes | 10k Sim Runs | 4 Failure Types | 1 Loop |
|-----------|--------------|--------------|-----------------|--------|

> CONFIDENTIAL · INTERNAL ENGINEERING DOCUMENT · FOR FOUNDERS: PRE-SEED TO SERIES A

---

## Table of Contents

1. [Platform Overview — What This System Does](#1-platform-overview)
2. [The Master Loop — How All Engines Connect](#2-the-master-loop)
3. [User Journey — End to End](#3-user-journey)
4. [Engine 1: Extraction Layer](#4-engine-1-extraction-layer)
5. [Engine 2: Pressure Test Engine](#5-engine-2-pressure-test-engine)
6. [Engine 3: Simulation Engine](#6-engine-3-simulation-engine)
7. [Engine 4: Decision Scoring Engine](#7-engine-4-decision-scoring-engine)
8. [Engine 5: Failure Analysis Layer](#8-engine-5-failure-analysis-layer)
9. [The Right Panel — Bias & Gap Detection](#9-the-right-panel)
10. [Memory Layer — The Learning Loop](#10-memory-layer)
11. [Data Contracts — How Engines Talk to Each Other](#11-data-contracts)
12. [Full API Map](#12-full-api-map)
13. [Database Schema](#13-database-schema)
14. [Tech Stack — Every Layer](#14-tech-stack)
15. [Build Sequence & Phase Plan](#15-build-sequence--phase-plan)
16. [Performance Targets & Cost](#16-performance-targets--cost)

---

## 1. Platform Overview

**What this system does and why it exists**

The Decision Intelligence Platform is a full-stack learning system that helps startup founders make better decisions — not by predicting the future, but by making uncertainty visible, quantified, and navigable. A founder describes a decision in plain English. The platform extracts its structure, stress-tests the assumptions, simulates thousands of possible outcomes, scores the options mathematically, and explains the verdict in plain language. When a decision fails in the real world, the platform diagnoses why — and feeds those lessons back into every future decision.

### Five Engines, One Loop

The platform is built from five specialist engines that form a single closed loop. Each engine has one job and passes a typed data contract to the next.

| Engine | Job | Input | Output |
|--------|-----|-------|--------|
| Extraction Layer | Convert plain-English decision into a structured, validated schema | Raw user text | Typed JSON schema |
| Pressure Test Engine | Stress-test the extracted assumptions with targeted scenarios | Schema + user profile | Stress-tested assumption set |
| Simulation Engine | Run 10,000 Monte Carlo simulations per option | Validated schema + causal model | Outcome distributions per option |
| Scoring Engine | Collapse distributions into a single comparable score per option | Simulation distributions | Score + confidence + explanation |
| Failure Analysis | Diagnose why a real-world decision failed; extract lessons | Outcome report + original snapshot | Root causes + pattern lessons |

> **Core principle:** Every decision is a distribution of outcomes, not a point estimate. The platform makes that distribution visible, comparable, and learnable.

---

## 2. The Master Loop

**How all five engines connect into a single learning system**

The diagram below is the complete system. Read it top to bottom for the **forward path** (a new decision being made), and follow the red dashed arrows for the **feedback path** (a failed decision closing the loop). The purple dashed line shows the memory layer feeding historical context back into extraction on every run.

```
User Input (Plain English decision description)
        |
        v
Extraction Layer  ──────────────────────────────>  Right Panel (async):
3-pass LLM pipeline → validated schema             - Biases detected
  Outputs:                                         - Weak assumptions
  variables[], risks[],                            - Missing variables
  assumptions[], constraints[]                     - Suggestions
        |
        v
Pressure Test Engine
Scenario generation + assumption stress
Pattern profile (on re-entry)
        |
        v
Simulation Engine ──────────────> Scoring Engine
10k Monte Carlo runs per option   Score = mean - risk penalties + upside
(user triggers)                   (backend, always)
        |                                 |
        v                                 v
                        Decision Engine
                        LLM verdict + rationale + confidence
                                |
                                v
                        Explanation Layer
                        LLM verdict card + risk alert + key assumption
                                |
                     [user acts in real world]
                                |
                                v
                        Failure Analysis
                        4-step: intake → gap analysis → lessons → re-entry
                                |
                         (loop re-entry + pattern profile)
                                |
        +-----------------------+
        |
        v
Memory Layer
Vector DB: stores schemas, patterns, outcomes
  - similar past decisions → stored
  - Founder thinking profile
  - Score history reveals decision patterns across all runs
```

> Solid arrows = primary data flow. Dashed arrows = feedback and context loops. The amber panel (right side during extraction) is generated asynchronously and does not block the main flow.

---

## 3. User Journey — End to End

**Every screen and state a founder moves through**

The journey has two modes: the **forward path** (making a new decision) and the **return path** (a decision failed in the real world and the founder comes back). Both paths share the same engine stack — the return path simply carries additional context.

### Forward Path — New Decision

| Step | Screen / State | What the user does | What the system does |
|------|---------------|-------------------|---------------------|
| 1 | Problem input | Types: Decision Title, Problem, Context, Constraints, Assumptions | Extraction Layer runs (3 LLM passes). Right panel starts generating. |
| 2 | Clarification | Reviews extracted variables; may edit or add | Schema validator confirms structure. Enrichment layer fills gaps. |
| 3 | Pressure test | Answers 4-6 scenario questions one at a time | Pressure Test Engine generates scenarios targeting weak assumptions. |
| 4 | Decision view | Reviews verdict, score, risk alert, key assumption | Scoring Engine runs in background. Explanation Layer produces verdict. |
| 5 | Simulation (optional) | Explores option distributions, adjusts weights | Monte Carlo runs 10k simulations. Sensitivity analysis highlights most sensitive variable. |
| 6 | Decide + snapshot | Confirms decision | Decision snapshot written to DB. Scoring stored for founder profile. Memory indexed. |

### Return Path — Decision Failed

| Step | Screen / State | What the user does | What the system does |
|------|---------------|-------------------|---------------------|
| 1 | Failure intake | Sees original decision + assumptions. Answers 4 structured questions. | System loads decision snapshot. Structured intake only — no open-ended questions. |
| 2 | Gap analysis | Reads assumption-by-assumption verdict | LLM compares original assumptions to reality. Drills to root cause (5-Why logic). |
| 3 | Lesson extraction | Reviews 1-3 lesson statements | Separate LLM call extracts lessons. Pattern profile updated. Pattern flagged if recurring. |
| 4 | Re-entry | Starts new decision on same topic | Pressure test receives pattern profile. Generates harder, targeted scenarios. |

---

## 4. Engine 1: Extraction Layer

**3-pass LLM pipeline that converts plain English into a validated machine-readable schema**

The Extraction Layer is the foundation of the entire platform. Every downstream engine — simulation, scoring, failure analysis — depends on the variables, constraints, risks, and assumptions it produces. A single broad LLM call cannot reliably extract all of this. The solution is three focused passes, each with a narrow mandate, followed by programmatic validation and enrichment.

### Pipeline Architecture

```
Pass 1 — Intent & Scope
Decision, actions, actors, constraints, time horizon
        |
        v
Pass 2 — Variable Extraction
Name, type, range, unit, importance, direction, affects
        |
        v
Pass 3 — Risk & Assumption Surfacing
Hidden deps, failure modes, implicit assumptions
        |
        v
Schema Validator (programmatic)
Type check, completeness, range sanity, conflict detect
        |
        v
Enrichment Layer
Fill gaps, cross-link variables, add domain priors
        |
        v
Consistency Engine (programmatic)
DAG contradiction check, variable dependency graph
        |
        v
Memory Layer (async write)
Index schema for future retrieval
```

> On validation failure (hard rules), the failed pass is re-run with the error context injected. Maximum 2 re-extraction attempts per failure. Enrichment and consistency checks are non-blocking — failure degrades gracefully.

### What Each Pass Extracts

| Pass | Fields Extracted | LLM Temp | Max Tokens |
|------|-----------------|----------|------------|
| Pass 1 | decision, decision_category, actions[], actors[], constraints[], time_horizon, success_criteria | 0.1 | 1200 |
| Pass 2 | variables[]: name, type, range, unit, importance, direction, affects, controlled_by, observability, default_value, extraction_confidence | 0.1 | 2000 |
| Pass 3 | risks[], assumptions[], hidden_deps[], known_unknowns[], domain_warnings[] | 0.1 | 1500 |
| Enrichment | Fills confidence < 0.6 vars, extends affects[], builds action_variable_map, adds domain_prior variables | 0.2 | 2500 |

### The Variable Object — Most Critical Schema Element

Every variable extracted in Pass 2 must have all 15 fields populated. Missing fields cause hard validation failures. The `direction` and `affects` fields are the most downstream-critical: `direction` drives the scoring engine, `affects` builds the simulation DAG.

| Field | Type | Required | Used By |
|-------|------|----------|---------|
| name | string (snake_case) | Yes | All engines |
| type | continuous \| categorical \| boolean \| ordinal | Yes | Simulation, Scoring |
| range | [min, max] | If continuous/ordinal | Simulation |
| possible_values | string[] | If categorical/boolean | Simulation |
| importance | critical \| high \| medium \| low | Yes | Scoring weight |
| direction | maximize \| minimize \| target | Yes | Scoring Engine |
| affects | string[] of variable names | Yes | Causal DAG / Simulation |
| controlled_by | actor name | Yes | Failure Analysis |
| observability | realtime \| lagged \| terminal | Yes | Consistency Engine |
| extraction_confidence | float 0.0-1.0 | Yes | Enrichment trigger |
| source | explicit \| inferred \| domain_prior | Yes | Audit trail |

### Validation Rules (18 total)

Hard rules trigger re-extraction. Soft rules are auto-fixed programmatically.

| Rule | Check | Severity | On Failure |
|------|-------|----------|------------|
| V001 | decision field is non-empty string | HARD | Re-run Pass 1 |
| V002 | actions array has 2-6 items | HARD | Re-run Pass 1 |
| V004 | variables array has minimum 3 items | HARD | Re-run Pass 2 |
| V006 | Continuous vars: range[0] < range[1] | HARD | Re-run Pass 2 |
| V008 | All variables have direction field set | HARD | Re-run Pass 2 |
| V015 | No two variables share the same name | HARD | Re-run Pass 2 |
| V010 | extraction_confidence is float 0.0–1.0 | SOFT | Clamp to [0,1] |
| V011 | affects[] refs only names in variables array | SOFT | Remove invalid refs |
| V018 | default_value is within range | SOFT | Clamp to midpoint |

---

## 5. Engine 2: Pressure Test Engine

**Assumption stress-testing before a decision is made**

The Pressure Test Engine receives the validated extraction schema and generates 4-6 targeted scenarios designed to break the user's assumptions. On first use, scenarios are derived from the extracted assumptions and known domain risks. On re-entry after failure, scenarios are harder — deliberately targeting the known weak spots from the user's pattern profile.

### How Scenarios Are Generated

The engine uses the extracted `assumptions[]`, `risks[]`, and `hidden_deps[]` from the extraction schema to generate specific, non-generic scenarios. Generic scenarios ("what if the market changes?") are explicitly prohibited in the prompt.

| Input Source | How It Drives Scenario Generation |
|-------------|----------------------------------|
| assumptions[] from extraction | Each fragility=high assumption gets at least one direct stress-test scenario |
| risks[] with severity=high | Converted into concrete failure scenarios ("what if X happens on day 30?") |
| hidden_deps[] | Turned into "what would you do if this dependency broke?" questions |
| user_patterns (re-entry) | Known weak spots get 2+ targeted scenarios. Flagged with which pattern they test. |
| domain_warnings[] | Standard pitfalls for this decision category woven into scenarios |

### Scenario Format Contract

```json
{
  "scenario_id": "s1",
  "question": "string — specific, concrete, referenced to their context",
  "targets_assumption": "assumption text from extraction schema",
  "targets_pattern": "pattern id from user profile (null on first run)",
  "pushback_triggers": [
    "if answer mentions X, push back with: ...",
    "if answer is vague, ask: what specifically would you do if..."
  ],
  "difficulty": "standard | hard",
  "failure_type_probe": "assumption | execution | external | framing"
}
```

> `difficulty: hard` = re-entry mode

### Re-entry Mode — Harder, Targeted Scenarios

What changes on re-entry vs first run:

- Scenarios explicitly reference what failed last time: *"Last time you assumed X. It broke. What's different now?"*
- At least 2 scenarios directly target the user's known patterns (count >= 2)
- Pushback on vague answers is mandatory — the engine must ask "what specifically"
- Difficulty is set to "hard" — first-run easy versions of these questions are skipped

### Pressure Test Prompt — Key Instruction Block

```
SYSTEM:
You are generating pressure-test scenarios for a startup founder decision.
The founder has already extracted their decision structure. Your job is to
challenge their assumptions — specifically, concretely, and relentlessly.

RULES:
- Never generate generic scenarios ("what if the market changes?")
- Every scenario must reference a specific assumption from the schema
- After each answer, push back if it is vague or optimistic
- Force specificity: "what EXACTLY would you do if..."

ON RE-ENTRY (if user_patterns is non-empty):
- Generate at least 2 scenarios targeting known weak spots
- Label each with: "This tests your known pattern: [pattern text]"
- Make these harder than first-run versions

EXTRACTION SCHEMA: {schema}
USER PATTERNS: {user_patterns}   // empty [] on first run
PREVIOUS FAILURE TYPE: {failure_type}   // null on first run
```

---

## 6. Engine 3: Simulation Engine

**10-layer Monte Carlo pipeline — causal model to outcome distributions**

The Simulation Engine takes the validated extraction schema and runs 10,000 independent simulations per decision option. Each simulation samples from the variable probability distributions defined in the schema, propagates values through the causal DAG, computes utility, and stores the result. The output is a distribution of utility outcomes per option — not a point estimate.

### 10-Layer Architecture

```
User Input → LLM Structure → Schema Validate → Causal Model → Scenario Engine
→ Monte Carlo Core → Aggregation → Scoring Engine → Output Interface → Feedback Loop
```

### Causal Model — The DAG

The causal model is a Directed Acyclic Graph (DAG) built directly from the `affects[]` field of each variable in the extraction schema. Each edge is a structural equation: the child variable is a deterministic function of its parent variables plus a noise term. This is the reason the simulation can answer counterfactual questions — not just "what happened when X was high" but "what would happen if I changed X?"

```python
# Structural equations with noise — built from affects[] in extraction schema
execution = 0.6 * skill + 0.4 * focus + Normal(0, 0.05)
revenue = market_growth * execution * time + Normal(0, 0.08)
success = sigmoid(revenue - threshold)  # probability 0-1

# Monte Carlo core
for i in range(N_SIMULATIONS):  # default N = 10,000
    theta = sample_parameters(causal_model)    # sample all distributions
    state = propagate_causal_graph(theta)      # compute all node values
    utility = compute_utility(state, weights)  # apply founder utility weights
    results[i] = utility                       # store
```

### Three Scenarios — Always Computed

| Scenario | Market Modifier | Execution Modifier | Purpose |
|----------|----------------|-------------------|---------|
| Best Case | +20% | +15% | Upside capture — what does winning look like? |
| Base Case | 0% | 0% | Expected value — default recommendation |
| Worst Case | -20% | -25% | Risk floor — runway stress test |
| Custom | User-defined | User-defined | Sector-specific shocks (optional) |

### Aggregation Layer — 6 Metrics

Each set of 10,000 simulation results is collapsed into 6 metrics. All 6 feed directly into the Scoring Engine.

| Metric | Formula | What it means | Scoring role |
|--------|---------|--------------|-------------|
| mean(U) | `np.mean(results)` | Expected utility across all sims | Base score component |
| std(U) | `np.std(results)` | Outcome volatility / unpredictability | Penalised by lambda-1 (0.30) |
| P(U<0) | `np.mean(results < 0)` | Fraction of bad outcome sims | Penalised by lambda-2 (0.40) — highest weight |
| CVaR | `mean(results[results < p5])` | Average of worst 5% outcomes | Penalised by lambda-3 (0.20) |
| P(U>0.5) | `np.mean(results > 0.5)` | Fraction of strong positive outcomes | Rewarded by lambda-4 (0.10) |
| Confidence | `mean(U_winner > U_runner)` | Certainty of recommendation | Below 0.60 = flag as too close |

> **CVaR is the most important metric for founders.** It answers: in the worst 5% of scenarios, what is my expected outcome? A decision with great average but catastrophic CVaR can kill a startup.

---

## 7. Engine 4: Decision Scoring Engine

**Collapsing distributions into a single score — the formula, utility function, and explanation layer**

The Scoring Engine receives the 6-metric aggregated summary for each option and produces a single comparable score, a confidence value, an explanation, and a sensitivity result. It runs in the background on every decision — the founder does not need to trigger it. Scores are stored and accumulate into a founder thinking profile over time.

### The Scoring Formula

```
Score(option) = mean(U) - lambda1·std(U) - lambda2·P(U<0) - lambda3·CVaR + lambda4·P(U>0.5)

lambda1 = 0.30  (risk aversion — penalises high variance)
lambda2 = 0.40  (downside penalty — most critical; founders fear ruin)
lambda3 = 0.20  (CVaR tail risk — penalises catastrophic worst-case outcomes)
lambda4 = 0.10  (upside bonus — rewards strong positive-outcome probability)
```

### Utility Function — Founder Edition

The utility function defines what a founder values. It converts a multi-dimensional outcome state into the single number that the Monte Carlo simulation stores.

```python
U = w1*(runway_preserved) + w2*(revenue_upside) + w3*(time_saved)
  - w4*(team_stress) - w5*(opportunity_cost)

# Stage-based default weights (all weights must sum to 1.0)
Stage presets:
    Pre-Seed:  runway=0.45  revenue=0.20  time=0.15  stress=0.12  opp=0.08
    Seed:      runway=0.30  revenue=0.25  time=0.20  stress=0.15  opp=0.10
    Pre-Ser A: runway=0.20  revenue=0.40  time=0.20  stress=0.12  opp=0.08

Constraints:
    - All weights strictly positive (min 0.02)
    - Must sum to exactly 1.0 (normalised after any adjustment)
    - No single weight may exceed 0.70 (prevents degenerate single-factor scoring)
```

### Regret Minimisation Mode

Alternative mode for highly risk-averse founders or situations where all options have negative CVaR. Instead of maximising score, it selects the option that minimises the maximum possible regret.

```python
Regret(a) = max_b[Score(b)] - Score(a)
MinRegret_dec = argmin_a[Regret(a)]

# Activate when:
# - All options have CVaR < 0
# - Runway < 6 months
# - Founder selects "avoid worst case" mode
```

### Explanation Layer

Every score must be accompanied by a plain-English explanation referencing the founder's specific numbers. Generic outputs ("Option B has lower risk") are explicitly rejected.

| Output | Description | Example |
|--------|-------------|---------|
| verdict | Primary reason the winner wins — one sentence, specific numbers | "Wait 3 months wins — its downside probability is 19% vs 9% for hire now, on your current runway." |
| risk_alert | What the bad scenario looks like in concrete terms | "In the worst 20% of hire-now scenarios, your runway drops below 8 months before first revenue." |
| key_assumption | The one variable that, if wrong, flips the recommendation | "MRR growth rate. If it drops below 8% (vs assumed 15%), hire now becomes worse." |

### Sensitivity Analysis

Run after scoring. Perturbs each variable by +20% and measures the impact on the score delta between winner and runner-up. The most sensitive variable is named in the explanation.

```python
def sensitivity_analysis(schema, baseline_output, n=1000):
    impacts = {}
    for var in schema["variables"]:
        modified = perturb(schema, var["id"], factor=1.20)
        new_output = run_simulation(modified, n=n)
        delta_base = baseline.winner.score - baseline.results[1].score
        delta_new = new_output.winner.score - new_output.results[1].score
        impacts[var["name"]] = abs(delta_new - delta_base)
    return max(impacts, key=impacts.get)  # most sensitive variable
```

---

## 8. Engine 5: Failure Analysis Layer

**What happens when a real-world decision fails — the loop that makes the system smarter**

The Failure Analysis Layer is what transforms this platform from a one-shot decision tool into a learning system. When a founder's decision fails in the real world, they return to the platform, describe what happened, and the engine diagnoses exactly why — assumption by assumption, using the original decision snapshot as the baseline.

> **Critical insight:** Failure analysis without the original decision snapshot is just venting. All value comes from comparing original reasoning to reality — assumption by assumption.

### The 5-Step Failure Loop

```
Decision Snapshot → Failure Intake → Gap Analysis → Lesson Extraction → Loop Re-entry
```

### Step 1 — Decision Snapshot (written at decision time)

Frozen at the moment of decision. Never mutated. Only `outcome` and `failure_analysis` fields are appended later. Must include the verbatim problem, all extracted assumptions (typed), scenarios tested, final decision, and confidence rationale.

### Step 2 — Failure Intake (4 structured questions, one at a time)

| # | Question | Why this question |
|---|----------|------------------|
| 1 | What did you actually do after the decision? | Confirms execution — distinguishes decision failure from execution failure |
| 2 | What outcome did you expect, and by when? | Surfaces the implicit expectation for precise comparison to reality |
| 3 | What outcome did you actually get? | The raw reality — compared assumption-by-assumption in gap analysis |
| 4 | What surprised you most? | Surfaces the assumption the user did not know they were making |

> Show the original decision and assumptions to the user before asking these questions. One question at a time — not as a form. After question 4, pass everything to gap analysis immediately.

### Step 3 — Gap Analysis (most important prompt in the system)

For each assumption in the snapshot: did it hold, partially hold, or break? For each broken assumption: drill 3-5 levels deep (5-Why logic) to find the root cause. Classify the failure type only after root cause analysis — not before.

### Four Failure Types

| Type | Definition | Key Signal | Recovery Path |
|------|-----------|-----------|--------------|
| Assumption Failure | A belief about the world was wrong | User surprised by factual or causal outcome | Update belief; re-test with corrected assumption |
| Execution Failure | The plan was sound, implementation broke | Decision was right in hindsight; delivery failed | Identify execution gap; plan was not the problem |
| External Shock | Unforeseeable external change altered conditions | No internal assumption or execution explains outcome | Accept; update world model. Use sparingly — exhaust all internal explanations first. |
| Framing Failure | Right problem solved, but it was the wrong problem | Decision "worked" but did not produce desired outcome | Restart from problem definition. Most expensive failure type. |

### Step 4 — Lesson Extraction & Pattern Profile

Separate LLM call after gap analysis. Extracts 1-3 lesson statements and checks whether each is a new pattern or reinforces an existing one. Pattern profile accumulates across all decisions.

```json
{
  "user_id": "string",
  "patterns": [
    {
      "pattern": "Consistently underestimates people/hiring complexity",
      "seen_in": ["decision_id_1", "decision_id_3"],
      "count": 2,
      "first_seen": "ISO",
      "last_seen": "ISO"
    }
  ]
}
```

> Pattern is surfaced to the user when `count >= 2`.

**Lesson statement rules:**
- Statements, not advice ("User overestimates hiring speed" NOT "You should plan longer")
- Third person — keeps lessons clinical rather than accusatory
- Specific, not generic ("User conflates market conditions across geographies")

### Step 5 — Loop Re-entry

The user re-enters the clarification → pressure-test → decision flow with additional context. The system does not start fresh.

| Stage | Fresh Decision | Re-entry After Failure |
|-------|---------------|----------------------|
| Clarification | LLM extracts assumptions from scratch | LLM loads previous assumptions, asks: which still hold? What changed? |
| Pressure testing | Scenarios based on stated assumptions | Scenarios target known weak spots from pattern profile. At least 2 mandatory. |
| Decision output | LLM outputs decision + rationale | LLM explicitly references what failed last time and how the new decision addresses it. |

---

## 9. The Right Panel

**Async analysis that runs alongside the main flow without blocking it**

While the main extraction flow runs (Pass 1 → 2 → 3 → Validator → Enrichment), a separate async LLM call generates the right-panel content. This content does not block or affect the main schema — it is purely additive, surfacing blind spots the user may not have considered.

### What the Right Panel Contains

| Panel Section | What It Shows | How It's Generated | When It Appears |
|--------------|--------------|-------------------|----------------|
| Biases detected | Cognitive biases present in the decision framing (e.g. sunk cost, optimism bias) | Async LLM call on the raw user input + extracted schema | After extraction completes |
| Weak assumptions | Assumptions from the extraction schema with fragility=high that haven't been challenged yet | From Pass 3 assumptions[] filtered by fragility | During pressure test phase |
| Missing variables | Variables standard for this decision_category that are absent from the schema | From enrichment layer domain_prior detection | After enrichment runs |
| Suggestions | Specific data points or experiments the founder could run to reduce uncertainty | Async LLM call using known_unknowns[] from Pass 3 | After all passes complete |

### Engineering note — right panel is fire-and-forget

- The right panel runs as a Celery background task — it never blocks the main flow
- If it fails, the main schema is unaffected. Log the failure, surface nothing
- It reads from the completed extraction schema — it does not modify it
- Right panel content is stored separately from the decision schema (different table)

---

## 10. Memory Layer

**How past decisions make every future extraction, simulation, and pressure test better**

The Memory Layer is the long-term moat of the platform. It stores every validated decision schema and makes similar past schemas available as few-shot context in future extractions. It also stores the user's pattern profile, scoring history, and outcome outcomes (when logged). Over time, the system learns your domain vocabulary, your failure patterns, and what kinds of decisions you tend to make well vs poorly.

### Three Storage Components

| Component | What It Stores | Technology | Used By |
|-----------|--------------|------------|---------|
| Schema store | Complete validated decision schemas, indexed by category and confidence | PostgreSQL (JSONB) | Extraction Layer (few-shot examples) |
| Vector index | 1536-dim embedding of each decision text for similarity search | pgvector extension | Extraction Layer (memory retrieval) |
| Pattern profile | Per-user failure patterns with count, timestamps, decision links | PostgreSQL (flat JSON per user) | Pressure Test (re-entry), Failure Analysis |
| Scoring history | All scores per user, per decision, over time — feeds thinking profile | PostgreSQL + TimescaleDB | Founder insights dashboard |
| Outcome records | Actual outcomes logged by user after real-world results | PostgreSQL | Failure Analysis, Bayesian calibration (future) |

### Memory Retrieval — How Past Decisions Are Injected

Before each extraction pipeline run, memory retrieval runs first (it is parallelisable with Pass 1). It returns the 2-3 most similar past decision schemas, which are injected into the Pass 1, Pass 2, and enrichment prompts as reference examples.

```python
# Hybrid retrieval — 3 signals combined
score = (
    0.6 * cosine_similarity(query_embedding, stored_embedding)  # semantic match
  + 0.3 * exact_match(decision_category)                        # category match
  + 0.1 * recency_bonus(created_at)                            # prefer recent
)
top_k = sorted(all_records, key=score, reverse=True)[:3]

# Storage criteria — only index high-quality schemas
must_pass = [
    overall_confidence >= 0.70,
    validation_passes <= 2,
    len(variables) >= 3,
    consistency_score >= 0.75,
]
```

---

## 11. Data Contracts

**The typed schemas that connect every layer**

Every engine boundary is a typed JSON contract. No engine reads from another engine's internal state — all communication is explicit schema passing. This means any engine can be replaced, upgraded, or tested in isolation without breaking the others.

### Extraction → Simulation Contract

```json
{
  "extraction_id": "uuid",
  "decision": "string",
  "actions": [{"id": "a1", "label": "Hire Now", "is_baseline": false}],
  "variables": [
    {
      "name": "mrr_growth",
      "type": "continuous",
      "range": [0, 0.5],
      "direction": "maximize",
      "importance": "critical",
      "affects": ["revenue", "runway_impact"],
      "default_value": 0.15,
      "extraction_confidence": 0.82
    }
  ],
  "constraints": [{"description": "14-month runway", "is_hard": true}],
  "assumptions": [{"statement": "...", "fragility": "high"}],
  "risks": [{"description": "...", "severity": "high", "probability_estimate": 0.3}]
}
```

### Simulation → Scoring Contract

```json
{
  "decision_id": "uuid",
  "founder_stage": "seed",
  "simulation_results": {
    "a1": [0.71, 0.68, 0.74],
    "a2": [0.62, 0.59, 0.65]
  },
  "actions": [{"id": "a1", "name": "Hire Now"}, {"id": "a2", "name": "Wait 3mo"}],
  "utility_weights": {
    "runway": 0.30, "revenue": 0.25, "time": 0.20, "stress": 0.15, "opp": 0.10
  },
  "mode": "maximise_score"
}
```

### Scoring → Explanation Contract

```json
{
  "winner": {"id": "a2", "name": "Wait 3 Months", "score": 0.75},
  "confidence": 0.83,
  "results": [
    {"id": "a2", "mean": 0.62, "std": 0.09, "downside": 0.09, "cvar": -0.07, "upside": 0.41, "score": 0.75},
    {"id": "a1", "mean": 0.71, "std": 0.14, "downside": 0.19, "cvar": -0.22, "upside": 0.55, "score": 0.66}
  ],
  "explanation": {
    "verdict": "Wait 3 months wins — its downside probability is 2x lower...",
    "risk_alert": "In the worst 20% of hire-now scenarios, runway drops below 8 months...",
    "key_assumption": "MRR growth rate. If it drops below 8%..."
  },
  "sensitivity": {"most_sensitive_var": "mrr_growth", "impact_score": 0.18}
}
```

### Decision → Failure Analysis Contract

```json
{
  "decision_id": "uuid",
  "problem": "original user input verbatim",
  "assumptions": [
    {"text": "hiring takes 2 weeks", "type": "factual", "held": null}
  ],
  "scenarios_tested": ["scenario text..."],
  "final_decision": "string",
  "confidence_rationale": "string",
  "outcome": {
    "what_was_done": "...",
    "expected_result": "...",
    "actual_result": "...",
    "biggest_surprise": "..."
  },
  "failure_analysis": {
    "failure_type": "assumption | execution | external | framing",
    "root_causes": ["..."],
    "lessons": ["..."]
  }
}
```

---

## 12. Full API Map

**Every endpoint the platform exposes**

| Method | Endpoint | What It Does | Async? |
|--------|---------|-------------|--------|
| POST | /api/v1/extract | Run full 3-pass extraction + validate + enrich. Returns final schema. | No (sync, 8-15s) |
| POST | /api/v1/simulate | Run Monte Carlo simulation for a given schema. Returns distributions. | Yes (Celery) |
| POST | /api/v1/score | Score simulation results. Returns ranked options + explanation. | No (sync, <1s) |
| POST | /api/v1/pressure-test | Generate pressure test scenarios for a schema. | No (sync, 3-6s) |
| POST | /api/v1/failure/intake | Submit failure intake answers for a past decision. | No (sync) |
| POST | /api/v1/failure/analyse | Run gap analysis + lesson extraction. Returns failure_analysis object. | No (sync, 5-10s) |
| GET | /api/v1/memory/similar | Retrieve 2-3 most similar past decisions for a given text. | No (sync, <500ms) |
| GET | /api/v1/profile/{user_id} | Return user pattern profile + scoring history. | No (sync) |
| POST | /api/v1/outcome | Log actual real-world outcome for a past decision. | No (sync) |
| GET | /api/v1/decisions/{user_id} | Return full decision history for a user. | No (sync) |
| GET | /api/v1/health | Health check — all services. | No |

### Authentication

- All endpoints require Bearer token (validated at API gateway — not inside each service)
- `user_id` is extracted from the JWT — never passed in request body for auth purposes
- Rate limits: `/extract` = 20 req/min, `/simulate` = 10 req/min (simulation is compute-heavy)

---

## 13. Database Schema

**Tables, relationships, and storage design**

| Table | Primary Key | Key Columns | Notes |
|-------|------------|------------|-------|
| decisions | decision_id (uuid) | user_id, extraction_id, created_at, stage, final_decision, snapshot (JSONB) | Written once at decision time. Append-only. |
| extraction_schemas | extraction_id (uuid) | decision_id, schema (JSONB), overall_confidence, validation_passes, created_at | Full validated schema stored here. |
| simulation_runs | run_id (uuid) | decision_id, option_id, results (float[]), n_sims, scenario, created_at | Large arrays — consider columnar storage. |
| scores | score_id (uuid) | decision_id, option_id, mean, std, downside, cvar, upside, score, confidence, created_at | TimescaleDB for time-series scoring history. |
| outcomes | outcome_id (uuid) | decision_id, what_done, expected, actual, surprise, logged_at | Appended when user returns after real-world results. |
| failure_analyses | analysis_id (uuid) | decision_id, failure_type, root_causes (text[]), lessons (text[]), created_at | Written after gap analysis completes. |
| pattern_profiles | user_id (string) | patterns (JSONB), updated_at | One row per user. JSONB array of pattern objects. |
| memory_index | memory_id (uuid) | extraction_id, decision_category, embedding (vector(1536)), variable_names (text[]) | pgvector table for similarity search. |
| right_panel_cache | panel_id (uuid) | decision_id, biases (text[]), weak_assumptions (text[]), suggestions (text[]), created_at | Async-written. Read-only by frontend. |

---

## 14. Tech Stack

**Every layer — recommended technologies with rationale**

| Layer | Technology | Alternative | Rationale |
|-------|-----------|------------|-----------|
| LLM — Primary | claude-sonnet-4-20250514 | gpt-4o | Best structured JSON output; fast extraction |
| LLM — Fallback | gpt-4o-mini | claude-haiku-4-5 | Cost-efficient fallback on primary LLM failure |
| LLM — Explanation | Groq (LLaMA-3.3-70B) | Claude | Fast, free tier, reliable JSON for explanation layer |
| API Framework | FastAPI (Python, async) | Express (Node) | Native async, Pydantic schema validation built in |
| Schema Validation | Pydantic v2 | Zod (TypeScript) | Type-safe, auto-generates JSON Schema from models |
| Simulation Core | NumPy + SciPy | JAX (GPU-scale) | Vectorised Monte Carlo; 10k runs in <2s on CPU |
| Causal Graph | NetworkX + pgmpy | custom DAG | DAG construction, cycle detection, structural equations |
| Primary DB | PostgreSQL 16+ (JSONB) | Supabase | Flexible schema storage; pgvector extension |
| Vector DB | pgvector (PostgreSQL ext) | Pinecone | No extra infra for MVP; upgrade at scale |
| Embeddings | text-embedding-3-small | ada-002 | Lower cost; sufficient for decision similarity |
| Time-series scores | TimescaleDB (PG ext) | InfluxDB | Native PostgreSQL; founder score trends over time |
| Job Queue | Celery + Redis | BullMQ (Node) | Async simulation jobs + right-panel generation |
| Observability | Langfuse | LangSmith | LLM-native tracing; per-pass latency tracking |
| Frontend (MVP) | Streamlit | React + Recharts | Ship fast; replace with React in Phase 2 |
| Frontend (Prod) | React + TypeScript + D3.js | Vue + ECharts | Interactive charts; decision tree visualisation |
| Container | Docker + docker-compose | Podman | Standard; works with any cloud provider |
| Experiment tracking | MLflow | Weights & Biases | Track weight versions, accuracy, A/B tests |
| Error monitoring | Sentry + Grafana | Datadog | Error rates, score drift alerts, latency dashboards |

---

## 15. Build Sequence & Phase Plan

**What to build in which order — and why**

Build in strict phase sequence. Each phase is independently shippable and useful. Do not start Phase 2 until Phase 1 is running end-to-end with real decisions. The failure analysis layer is useless without high-quality decision snapshots — which means **Phase 1 quality determines everything downstream.**

### PHASE 1 — Foundation (8-10 weeks)

- Extraction Layer — all 3 passes + validator + enrichment
- Basic pressure test (first-run scenarios only)
- Decision output — LLM verdict, no scoring yet
- Decision snapshot write (critical — everything depends on this)
- Simple frontend: problem input → pressure test → decision
- PostgreSQL schema: decisions, extraction_schemas tables
- FastAPI: `/extract`, `/pressure-test`, `/score` endpoints

### PHASE 2 — Simulation & Scoring (6-8 weeks)

- Monte Carlo simulation engine (NumPy core)
- Causal DAG builder from extraction schema `affects[]` field
- Scoring formula + utility function + regret minimisation mode
- Explanation layer (verdict, risk alert, key assumption)
- Sensitivity analysis
- Frontend: simulation charts, score cards, distribution visualisation
- Memory layer: pgvector index + hybrid retrieval

### PHASE 3 — Failure Analysis & Learning (6-8 weeks)

- Failure intake UX (4 questions, one at a time)
- Gap analysis prompt + assumption-by-assumption verdict
- Lesson extraction + pattern profile storage
- Pattern surfacing (note appears when count >= 2)
- Adaptive pressure testing (re-entry mode)
- Right panel: bias detection + suggestions (async)
- Founder thinking profile dashboard

### PHASE 4 — Scale & Moat (ongoing)

- Bayesian weight updating from real outcome data
- Anonymised aggregate benchmarks across founder decisions
- Slack / WhatsApp bot interface
- Decision templates (50+ founder scenarios)
- Domain-specific causal model priors
- Fine-tuning on accumulated extraction examples (post-500 decisions)

---

## 16. Performance Targets & Cost

### End-to-End Latency Budget (full forward path)

| Component | Typical | P95 Budget | Parallelisable? |
|-----------|---------|-----------|----------------|
| Memory retrieval (pre-fetch) | 200ms | 500ms | Yes — runs while user reads intro |
| Extraction Pass 1 | 1.2s | 2.5s | No (sequential) |
| Extraction Pass 2 | 2.1s | 4.0s | No (depends on P1) |
| Extraction Pass 3 | 1.8s | 3.5s | No (depends on P2) |
| Schema validation | 10ms | 50ms | Yes |
| Enrichment LLM call | 2.8s | 5.5s | No (depends on validation) |
| Consistency engine | 30ms | 200ms | Yes |
| Right panel generation (async) | n/a — non-blocking | n/a | Yes — fire and forget |
| Pressure test scenario gen | 3.0s | 6.0s | No (sequential after extraction) |
| Monte Carlo simulation (10k) | 1.5s | 4.0s | Yes — per-option parallelisable |
| Scoring + explanation | 2.5s | 5.0s | No (depends on simulation) |
| **Total extraction + pressure test** | **~11s** | **~20s** | — |
| **Total with simulation + scoring** | **~15s** | **~29s** | — |

### Cost Per Decision (full forward path)

| Component | Input Tokens | Output Tokens | Est. Cost |
|-----------|-------------|--------------|-----------|
| Extraction Pass 1 | ~800 | ~400 | $0.004 |
| Extraction Pass 2 | ~1,200 | ~800 | $0.008 |
| Extraction Pass 3 | ~1,400 | ~600 | $0.007 |
| Enrichment | ~2,500 | ~1,200 | $0.015 |
| Pressure test (4 scenarios) | ~1,000 | ~600 | $0.006 |
| Explanation layer (fast model) | ~600 | ~300 | $0.001 |
| Right panel (async, fast model) | ~800 | ~400 | $0.002 |
| Failure analysis gap (if triggered) | ~1,500 | ~800 | $0.009 |
| **Total per full decision** | **~8,000** | **~4,500** | **~$0.043** |

**Cost at scale:**
- 1,000 decisions/month: ~$43
- 10,000 decisions/month: ~$430
- Switch Pass 3 and pressure test to Haiku/mini at scale → ~30% cost reduction
- Memory retrieval embeddings: ~$0.001 per decision — negligible
- Monte Carlo (NumPy, CPU): negligible compute cost at 10k simulations

### Service Level Objectives

| SLO | Target | Measurement |
|-----|--------|------------|
| Extraction success rate | >95% | Extractions completing without hard error / total |
| Schema passes validation first try | >85% | No re-extraction needed |
| P95 extraction latency | <15 seconds | From POST /extract to response |
| Simulation job completion | <10 seconds | From POST /simulate to results available |
| Overall extraction confidence | >0.75 median | overall_confidence field across all successful extractions |
| Pattern profile accuracy | >80% recall | Relevant past schemas retrieved when available |
| Failure analysis delivery | <12 seconds | From POST /failure/analyse to response |

---

*End of Master Architecture Specification — v1.0*

> For questions: raise in engineering Slack or file an issue in the platform repo. Individual engine specs: see Extraction Layer Spec, Simulation Engine Spec, Decision Scoring Engine Spec, Failure Analysis Spec.
