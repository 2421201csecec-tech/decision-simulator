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

Lint:

```bash
npm run lint
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

1. Reduce autosave request frequency and avoid grouped refresh on every save.
2. Add integration tests for stage transitions and persistence.
3. Replace file store with PostgreSQL-backed persistence.
4. Introduce background jobs/SSE for heavier analysis steps.
