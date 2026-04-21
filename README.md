# Eidoz - Project Context (Root)

This README is the canonical project context for Eidoz.
It is intended to help any contributor resume work quickly without relying on chat history.

## 1) What Eidoz Is

Eidoz is a structured decision-intelligence product, not a generic chatbot.

Core goal:
- Improve decision quality over time through a repeatable decision workflow.

Core value:
- Users move through explicit stages (clarify, test, simulate, diagnose) and capture outcomes.
- The system converts those artifacts into better future decisions.

## 2) Current Product Scope (V1 Core)

In scope now:
- Decision threads and grouped navigation
- Clarify stage (problem framing)
- Pressure-test stage (scenario questioning)
- Simulation stage (variable-driven projections)
- Decision output synthesis
- Failure analysis and rebuild loop

Out of scope for this phase:
- Full autonomous intelligence loops
- Advanced calibration/scoring governance
- Deep extraction learning pipelines
- Collaboration/multi-user enterprise features

## 3) Confirmed User Workflow

1. User creates/selects a decision thread.
2. User fills Clarify draft: title, core problem, desired outcome, context, constraints, assumptions.
3. User runs pressure-test scenarios and answers/skips each scenario.
4. User runs simulation with variables (price, market, spend, horizon).
5. System generates decision output synthesis.
6. User can run failure analysis to diagnose what went wrong and rebuild.

## 4) Current Tech Architecture

Current implementation (in this repo):
- Next.js App Router frontend
- Next.js API routes as interim backend
- File-based persistence in .data/threads.json

Planned future architecture:
- Dedicated backend service (FastAPI)
- PostgreSQL as source of truth
- Optional Redis/Celery/SSE for async intelligence workflows

## 5) Current Workspace Layout

- frontend/: active app codebase (canonical)
- eidoz_complete_product_blueprint.pdf: original product blueprint artifact

Important note:
- frontend/ is the active app folder.
- Legacy folders from earlier exploration are not canonical.

## 6) Implemented Backend Surface (Inside frontend/app/api)

Implemented routes:
- GET /api/health
- GET /api/threads
- POST /api/threads
- GET /api/threads/:threadId/clarify-draft
- PUT /api/threads/:threadId/clarify-draft
- GET /api/threads/:threadId/pressure-test
- POST /api/threads/:threadId/pressure-test
- POST /api/threads/:threadId/pressure-test/answer
- POST /api/threads/:threadId/pressure-test/skip
- GET /api/threads/:threadId/simulation
- POST /api/threads/:threadId/simulation
- GET /api/threads/:threadId/simulation/history
- GET /api/threads/:threadId/decision-output
- GET /api/threads/:threadId/failure-analysis
- PUT /api/threads/:threadId/failure-analysis

## 7) Core Domain Behavior Already Implemented

- Thread grouping by status: active, revision, failed, completed/history
- Clarify draft save/load
- Pressure-test state progression and response capture
- Simulation run generation and history
- Decision output derived from draft + pressure + simulation
- Failure analysis generation and save
- Stale invalidation on clarify edit (downstream artifacts reset)

## 8) Current Known Limitations

- File storage only (no DB yet)
- Pressure scenarios are template-based
- No formal queue/worker/SSE architecture yet
- Autosave path currently has avoidable request churn and UI fluctuation risk
- Route validation and test coverage are not yet hardened

## 9) Immediate Priorities (Execution Order)

1. Autosave stabilization
- Remove grouped thread refresh from autosave path
- Save only on meaningful payload changes
- Reduce UI status flicker

2. API validation hardening
- Add strict input schemas
- Standardize error envelopes
- Add semantic checks on pressure/simulation payloads

3. Tests
- Add route and store-level tests for critical path
- Cover happy-path and invalid payload behavior

4. Backend split preparation
- Introduce repository abstraction
- Map ThreadRecord shape to DB schema
- Add migration readiness checks

## 10) Source-of-Truth Files in frontend/

- app/page.tsx: dashboard orchestration
- components/dashboard/*: stage UI components
- app/api/**: route handlers
- lib/api/threads.ts: frontend API client contracts
- lib/server/thread-store.ts: current server-side state + domain logic
- .data/threads.json: local persisted state

## 11) How To Run

From frontend/:

- Install: npm install
- Dev server: npm run dev
- Build: npm run build
- Start production build: npm run start
- Lint: npm run lint

## 12) Stability and Quality Gates Before Backend Extraction

Must be green before splitting backend service:
- Autosave network churn reduced
- Core flow works end-to-end without regressions
- Deterministic validation responses for invalid payloads
- Basic automated tests passing for core routes/store

## 13) Resume Handoff Prompt (Copy/Paste)

"Read README.md at workspace root and frontend/README.md first. Then continue from Immediate Priorities section, starting with autosave stabilization in app/page.tsx and components/dashboard/clarify-form.tsx. Validate by reducing repeated clarify PUT + grouped threads GET churn while preserving save correctness."

## 14) Project Intent Snapshot

Eidoz is being built as a learning-intensive, hands-on product where correctness of stage wiring, deterministic behavior, and iterative reliability matter more than premature scaling.

## 15) Change Log

### 2026-04-20
- Added root project context README.
- Confirmed canonical app location as frontend/.
- Documented implemented API surface and immediate execution priorities.
- Stabilized clarify autosave flow to reduce duplicate saves and removed grouped-thread refresh from autosave path.
- Added centralized route payload schemas and stricter validation for thread create, clarify save, pressure answer/skip, simulation, and failure-analysis endpoints.
- Verified frontend build passes after changes.
