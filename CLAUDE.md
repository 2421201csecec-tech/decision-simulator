# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Eidoz is a structured decision-intelligence product. Users move through explicit stages — **Clarify → Pressure-Test → Simulate → Decision Output → Failure Analysis** — and the system captures artifacts at each stage to improve future decisions.

## Commands

### Frontend (run from `frontend/`)

```bash
npm install          # install dependencies
npm run dev          # dev server (Next.js)
npm run build        # production build
npm run lint         # ESLint on app/api, lib, test-utils
npm run test         # run all tests once (Vitest)
npm run test:watch   # watch mode
npm run test:cov     # tests with coverage report
```

Run a single test file:
```bash
npx vitest run app/api/threads/route.test.ts
```

### Backend (run from `backend/`)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Architecture

### Two-Layer Setup (Strangler Migration in Progress)

The project is mid-migration from a Next.js-only backend to a dedicated FastAPI service, using the **strangler pattern**:

1. **Next.js API routes** (`frontend/app/api/`) remain the stable external interface for the frontend UI.
2. Each Next.js route handler calls `proxyRequestToCoreBackend()` first. If the proxy is enabled and the FastAPI backend responds, that result is returned. Otherwise the route falls back to local logic.
3. The **FastAPI backend** (`backend/`) is the emerging canonical backend, currently handling threads, clarify-draft, and pressure-test.

**Proxy is enabled via env vars in `frontend/.env.local`:**
```
ENABLE_CORE_BACKEND_PROXY=true
CORE_BACKEND_URL=http://localhost:8000
```
When these are unset, the frontend runs fully standalone using the local TypeScript store.

### Data Persistence

Both layers persist to flat JSON files:
- **Frontend standalone:** `frontend/.data/threads.json`
- **FastAPI backend:** `backend/.data/threads.json`

These are separate files. When proxy mode is enabled, frontend routes forward to the backend, so the backend's file is the live store.

### Core Domain Model

`ThreadRecord` is the central entity (TypeScript canonical type in `frontend/lib/server/thread-store.ts`):

```
ThreadRecord
  ├── clarifyDraft       (title, coreProblem, desiredOutcome, context, constraints[], assumptions[])
  ├── pressureTest       (scenarios[], currentIndex, responses{}, completed)
  ├── simulationRuns[]   (variables, results, createdAt)
  └── failureAnalysis    (whatHappened, observations[], failedAssumptions[], rootCause, derived fields)
```

**Key invariant:** Saving a clarify draft wipes `pressureTest`, `simulationRuns`, and `failureAnalysis` to force recomputation downstream. This is intentional and must be preserved in both the TypeScript store and the Python store.

### File Roles

| Path | Purpose |
|------|---------|
| `frontend/lib/server/thread-store.ts` | Canonical TypeScript domain logic and all data mutation functions |
| `frontend/lib/server/core-backend-proxy.ts` | Strangler proxy utility — checks env flags and forwards requests to FastAPI |
| `frontend/lib/server/validation.ts` | Shared input validation helpers for Next.js routes |
| `frontend/app/api/**/route.ts` | Next.js route handlers — thin: validate, proxy-check, then call thread-store |
| `backend/app/storage/thread_store.py` | Python mirror of the TypeScript store — same JSON schema, same business rules |
| `backend/app/api/routes/` | FastAPI route handlers (threads, clarify_draft, pressure_test, health) |
| `backend/app/main.py` | FastAPI app bootstrap; all routes prefixed `/api/v1/` |
| `docs/phase-a-contract-freeze.md` | **Frozen contract** — the do-not-break request/response shapes for all endpoints |

### API URL Prefixes

- Next.js routes: `/api/threads/...` (no version prefix)
- FastAPI backend: `/api/v1/threads/...`

The proxy in `core-backend-proxy.ts` translates paths when forwarding.

### Migration Safety Rule

The contract in `docs/phase-a-contract-freeze.md` is the baseline. Any new backend route must match the exact response shape before the proxy is enabled for that route. Route cutover is per-endpoint, not all at once. Parity tests must pass before enabling.

### Thread Statuses and Grouping

Threads are grouped for display by status:
- `active` → active group
- `revision` → revisions group
- `failed` → failureAnalysis group
- `completed` (or anything else) → history group

A thread with a `parentThreadId` defaults to `revision` status on creation.

### Simulation Engine

Simulation results are computed deterministically in `estimateSimulationResult()` in the TypeScript store (and its Python counterpart) — there is no external AI call here yet. Results depend on price, marketingSpend, targetMarket, and timeHorizon inputs.

Decision output (`getDecisionOutputData`) is derived on-the-fly from the thread's clarify draft + latest simulation run + pressure test responses — it is not stored separately.
