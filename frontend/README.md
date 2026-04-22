# Eidoz Frontend (V1 Core)

Eidoz is a decision-workflow app built with Next.js. This repository currently contains both:

- The UI (dashboard, panels, stage flows)
- The API layer (Next.js route handlers)

The current V1 core flow is:

1. Clarify the decision
2. Pressure-test the decision with scenarios
3. Run simulation(s)
4. Generate decision output
5. Diagnose failure and rebuild

## Tech Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- File-based persistence using JSON (`.data/threads.json`)

## Current Status

Implemented and wired end-to-end:

- Thread creation and grouped thread navigation
- Clarify Draft save/load with autosave
- Pressure Test generation, answer, and skip
- Simulation run + latest + history
- Decision Output synthesis from thread data
- Failure Analysis load/save with derived insights

Known limitations in this phase:

- Persistence is file-based (not PostgreSQL)
- Pressure-test scenarios are template-based
- No queue/worker/SSE architecture yet
- Autosave currently causes extra network chatter and will be optimized

## Prerequisites

- Node.js 20+
- npm 10+

## Getting Started

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm run start
```

Lint (backend and test scope):

```bash
npm run lint
```

Run tests:

```bash
npm run test
```

Run coverage report:

```bash
npm run test:cov
```

Open:

- http://localhost:3000

## API Surface

All endpoints are implemented under `app/api`.

### Health

- `GET /api/health`
  - Response: `{ ok: true, service: "eidoz-api" }`

### Threads

- `GET /api/threads`
  - Returns all threads (flattened)
- `GET /api/threads?grouped=true`
  - Returns grouped threads: `active`, `revisions`, `failureAnalysis`, `history`
- `POST /api/threads`
  - Creates a thread
  - Body (optional): `{ title?: string, parentThreadId?: string, status?: "active" | "revision" | "failed" | "completed" }`

### Clarify Draft

- `GET /api/threads/:threadId/clarify-draft`
  - Returns draft for the thread
- `PUT /api/threads/:threadId/clarify-draft`
  - Saves draft and invalidates downstream derived artifacts
  - Body: `{ title, coreProblem, desiredOutcome, context, constraints, assumptions }`

### Pressure Test

- `GET /api/threads/:threadId/pressure-test`
  - Returns current pressure-test state
- `POST /api/threads/:threadId/pressure-test`
  - Generates pressure-test state if missing
- `POST /api/threads/:threadId/pressure-test/answer`
  - Body: `{ scenarioId: number, answer: string }`
- `POST /api/threads/:threadId/pressure-test/skip`
  - Body: `{ scenarioId: number }`

### Simulation

- `GET /api/threads/:threadId/simulation`
  - Returns latest run
- `POST /api/threads/:threadId/simulation`
  - Body: `{ price, targetMarket, marketingSpend, timeHorizon }`
- `GET /api/threads/:threadId/simulation/history`
  - Returns all runs for the thread

### Decision Output

- `GET /api/threads/:threadId/decision-output`
  - Returns synthesized decision output from draft + pressure responses + latest simulation

### Failure Analysis

- `GET /api/threads/:threadId/failure-analysis`
  - Returns failure-analysis state (creates defaults if missing)
- `PUT /api/threads/:threadId/failure-analysis`
  - Saves analysis and derives insights
  - Body: `{ whatHappened, observations, failedAssumptions, rootCause }`

## Data Model Notes

Data is persisted to `.data/threads.json`.

Each thread can include:

- `clarifyDraft`
- `pressureTest`
- `simulationRuns`
- `failureAnalysis`

When Clarify Draft is saved, downstream artifacts are intentionally invalidated:

- `pressureTest` reset
- `simulationRuns` reset
- `failureAnalysis` reset

This keeps stage outputs consistent with the latest decision context.

## Project Structure (Important Paths)

- `app/page.tsx`: main dashboard orchestration
- `components/dashboard/*`: UI panels and stage components
- `app/api/**`: API route handlers
- `lib/api/threads.ts`: frontend API client contracts
- `lib/server/thread-store.ts`: server store and domain logic

## Suggested Next Steps

1. Expand route matrix coverage for simulation and failure-analysis endpoints.
2. Add broader stage integration tests beyond current contract-focused suite.
3. Replace file store with PostgreSQL-backed persistence.
4. Introduce background jobs/SSE for heavier analysis steps.

## Core Backend Migration Workflow (FastAPI + Strangler)

The frontend keeps calling the same API routes under app/api while backend logic is progressively moved to a dedicated FastAPI service.

Locked decisions:
- FastAPI is the core backend runtime.
- Strangler mode is mandatory for migration safety.
- Rollout follows the full five-engine backend blueprint.

### Phase A Execution Order

1. Contract freeze
- Freeze request/response/error shapes for:
  - /api/threads
  - /api/threads/:threadId/clarify-draft
  - /api/threads/:threadId/pressure-test
  - /api/threads/:threadId/pressure-test/answer
  - /api/threads/:threadId/pressure-test/skip
  - /api/threads/:threadId/simulation
  - /api/threads/:threadId/simulation/history
  - /api/threads/:threadId/decision-output
  - /api/threads/:threadId/failure-analysis

2. Backend service skeleton
- Add minimal backend service with FastAPI app, config, health route, and logging.

3. Proxy path from existing API layer
- Existing Next route handlers forward to backend when a feature flag is enabled.
- Existing local logic remains fallback until parity is verified.

4. First vertical slice
- Migrate threads create/list first.
- Validate status code and payload shape parity before moving to other routes.

5. Boundary parity tests
- Add endpoint parity tests asserting unchanged frontend contract behavior for each migrated route.

### Full Five-Engine Backend Blueprint

1. Extraction engine (pass pipeline, validation, enrichment, consistency).
2. Pressure-test engine (scenario generation and progression).
3. Simulation engine (deterministic parity mode, then Monte Carlo mode).
4. Scoring engine (distribution scoring, confidence, sensitivity).
5. Failure-analysis engine (intake, gap analysis, lessons, re-entry context).

Supporting layer:
- Memory retrieval and write governance (semantic + category + recency).

### Migration Rules

- Frontend contracts in lib/api/threads.ts stay stable during migration.
- Cutover is endpoint-by-endpoint, never big-bang.
- Feature flags must allow immediate rollback to local route logic.
- No local domain code removal until parity and soak metrics pass.

## Testing and Lint Baseline (Apr 21, 2026)

Implemented quality gate:

- ESLint configured and runnable via `npm run lint`.
- Vitest configured with direct route handler invocation tests.
- Coverage reporting enabled via `npm run test:cov` (soft reporting only).

Current automated coverage includes:

- Validation schemas in `lib/server/validation.ts`
- Store critical flows in `lib/server/thread-store.ts`
- Route contracts for:
  - `app/api/threads/route.ts`
  - `app/api/threads/[threadId]/clarify-draft/route.ts`
  - `app/api/threads/[threadId]/pressure-test/answer/route.ts`
  - `app/api/threads/[threadId]/pressure-test/skip/route.ts`

Deferred test expansion:

- Full simulation route matrix (latest + history edge cases)
- Full failure-analysis route matrix
- UI component tests (currently out of scope for backend-start baseline)
