## Plan: Core Backend Blueprint and Migration

Build a FastAPI core backend behind existing Next API routes using a strangler pattern, preserving current frontend contracts while incrementally introducing extraction, pressure-test, simulation, scoring, failure-analysis, and memory services with milestone gates. This minimizes frontend disruption, keeps learning velocity high, and creates a clean path from file-based local logic to production-grade service boundaries.

**Steps**
1. Phase A: Contract Freeze and Migration Envelope (blocks all later phases)
2. Freeze current frontend-facing contracts from existing route handlers and lock response envelope conventions for success and errors.
3. Add backend base URL configuration and proxy pass-through strategy in Next routes so UI continues calling the same paths.
4. Define canonical versioned backend API namespace and map each current route to target core endpoints.
5. Phase B: Core Platform Skeleton (depends on phase A)
6. Scaffold FastAPI service with domain modules: extraction, pressure, simulation, scoring, failure, memory, and shared validation.
7. Add infrastructure modules: auth middleware stub, request correlation IDs, structured logging, health endpoint, config management.
8. Create PostgreSQL schema baseline with migration tooling and initial tables for users, decisions, extraction_schemas, memory_index, simulation_runs, scores, failure_analyses.
9. Wire repository interfaces for each domain and start with a file-backed adapter for parity and rapid verification, then PostgreSQL adapter.
10. Phase C: Engine 1 Extraction Implementation (depends on phase B)
11. Implement pass pipeline orchestration: pass 1 intent, pass 2 variables, pass 3 risk and assumptions, schema validation, enrichment, consistency checks.
12. Implement hard and soft validation rule system with deterministic re-extraction loop limits and metrics per rule.
13. Implement extraction persistence and memory indexing write hooks, with fallback-safe behavior on partial failures.
14. Expose extraction endpoint and route-proxy integration while preserving existing frontend payload expectations.
15. Phase D: Engine 2 Pressure Test (depends on phase C, parallel with phase C test hardening)
16. Implement scenario generation service from assumptions, risks, hidden dependencies, with first-run and re-entry modes.
17. Implement response progression model compatible with current frontend pressure flow and scenario step validation.
18. Expose pressure endpoints and swap Next route internals to backend proxy calls while preserving existing UI contracts.
19. Phase E: Engine 3 Simulation and Engine 4 Scoring (depends on phase D)
20. Implement simulation orchestrator with pluggable strategy: initial deterministic parity mode, then Monte Carlo mode behind feature flag.
21. Implement scoring pipeline using aggregated distribution metrics, confidence, and sensitivity analysis hooks.
22. Implement decision output synthesis endpoint combining clarify, pressure, simulation, and scoring artifacts.
23. Introduce asynchronous execution envelope for heavy simulation runs with synchronous fallback for local development.
24. Phase F: Engine 5 Failure Analysis and Loop Re-entry (depends on phase E)
25. Implement failure intake persistence, gap analysis service, lesson extraction, and pattern profile updates.
26. Implement re-entry context composer to influence extraction and pressure generation using historical failure signals.
27. Expose failure-analysis endpoints and preserve current frontend diagnose behavior.
28. Phase G: Memory Layer and Learning Loop Completion (depends on phases C through F)
29. Implement hybrid retrieval service combining semantic similarity, category match, and recency scoring.
30. Integrate memory retrieval into extraction pre-context path with strict relevance threshold and observability.
31. Add governance rules for memory writes: quality thresholds, dedupe checks, and schema confidence gates.
32. Phase H: Progressive Cutover and Hardening (depends on all prior phases)
33. Migrate each Next API route from local thread-store execution to proxy mode endpoint-by-endpoint with feature flags.
34. Keep contract parity tests at proxy boundary to ensure frontend behavior is unchanged during cutover.
35. Remove dead local domain logic only after parity and soak metrics pass agreed thresholds.
36. Add SLO dashboard and runbooks for extraction latency, validation pass rate, simulation job time, and failure-analysis turnaround.
37. Phase I: Tiered Data Export (depends on phase H for stable contracts; tier enforcement depends on auth rollout)
38. Add per-thread export endpoint and all-threads export bundle endpoint with download headers and stable schema versioning.
39. Free export includes rawInput (clarify snapshot), clarify, pressure-test, decision-output, and failure-analysis; simulation remains excluded until auth/billing context is live.
40. After auth integration, enforce free vs paid simulation inclusion and add ownership checks, audit log events, and tier parity tests.

**Relevant files**
- /home/himanshu/Work/eidoz/frontend/lib/server/thread-store.ts — current domain behavior baseline to preserve during backend extraction.
- /home/himanshu/Work/eidoz/frontend/lib/server/validation.ts — canonical validation expectations currently visible to frontend flows.
- /home/himanshu/Work/eidoz/frontend/lib/api/threads.ts — client contract layer that must remain stable during strangler migration.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/route.ts — proxy migration entrypoint for thread list and create.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/clarify-draft/route.ts — proxy migration for clarify lifecycle.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/pressure-test/route.ts — proxy migration for pressure generation and retrieval.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/pressure-test/answer/route.ts — proxy migration for pressure progression contract.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/pressure-test/skip/route.ts — proxy migration for skip progression contract.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/simulation/route.ts — proxy migration for simulation execution and latest result.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/simulation/history/route.ts — proxy migration for simulation history.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/decision-output/route.ts — proxy migration for synthesized decision view.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/failure-analysis/route.ts — proxy migration for failure loop behavior.
- /home/himanshu/Work/eidoz/master_architecture.md — target reference for engine boundaries, data contracts, storage, and milestones.
- /home/himanshu/Work/eidoz/docs/export_feature.md — canonical export contract and free/paid section policy.
- /home/himanshu/Work/eidoz/backend/app/api/routes/export.py — planned backend export routes for per-thread and all-thread bundle.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/[threadId]/export/route.ts — planned per-thread export proxy route.
- /home/himanshu/Work/eidoz/frontend/app/api/threads/export/all/route.ts — planned account-level export proxy route.

**Verification**
1. Contract parity: existing frontend flows pass unchanged against proxy-backed endpoints.
2. Test gates: backend unit and integration tests green for each engine before route cutover.
3. Performance gates: extraction P95, simulation completion times, and failure-analysis response times track against milestone targets.
4. Data integrity gates: decision snapshot completeness, memory index quality thresholds, and no orphaned cross-engine records.
5. Rollout safety: feature flags allow per-endpoint fallback to local route logic until soak period passes.
6. Export parity: per-thread and all-thread exports include stable section shapes and correct Content-Disposition headers.
7. Tier gate readiness: simulation remains excluded pre-auth and is included only when paid-plan context is present post-auth.

**Decisions**
- Runtime chosen: FastAPI Python for core backend implementation.
- Migration pattern chosen: strangler proxy through existing Next API routes.
- Plan depth chosen: full five-engine blueprint with milestone checkpoints.
- Frontend contract stability is in scope; frontend redesign is out of scope.
- Initial objective is behavior parity and architecture clarity before optimization.
- Export scope approved: per-thread and all-thread exports.
- Export rawInput source approved: clarify snapshot for v1.
- Tier enforcement timing approved: activate free vs paid simulation gating only after auth/billing context exists.

**Further Considerations**
1. Simulation launch mode: start with deterministic parity mode then enable Monte Carlo. Recommendation: parity first for confidence and faster cutover.
2. Storage transition: begin with repository interfaces and dual adapters before full PostgreSQL reliance. Recommendation: dual adapters to reduce migration risk.
3. Auth rollout timing: introduce strict JWT verification before external access while allowing local dev bypass. Recommendation: staged auth with environment-gated enforcement.

## Immediate Sprint Sequence (Execution-Ready)

1. Sprint 1: Pressure-test migration completion (next implementation target)
2. Backend: add `backend/app/api/routes/pressure_test.py` with endpoints:
3. `GET /api/v1/threads/{thread_id}/pressure-test`
4. `POST /api/v1/threads/{thread_id}/pressure-test`
5. `POST /api/v1/threads/{thread_id}/pressure-test/answer`
6. `POST /api/v1/threads/{thread_id}/pressure-test/skip`
7. Backend storage additions in `backend/app/storage/thread_store.py`: pressure scenario defaults, state progression, answer/skip validators, completed-state handling.
8. Register router in `backend/app/main.py`.
9. Frontend proxy integration in:
10. `frontend/app/api/threads/[threadId]/pressure-test/route.ts`
11. `frontend/app/api/threads/[threadId]/pressure-test/answer/route.ts`
12. `frontend/app/api/threads/[threadId]/pressure-test/skip/route.ts`
13. Add proxy-first + fallback behavior exactly matching clarify-draft/threads pattern.
14. Tests: expand `frontend/app/api/threads/[threadId]/pressure-test/route.test.ts` with proxy GET/POST + answer/skip proxy/fallback tests.
15. Verification: `npm run test -- "app/api/threads/[threadId]/pressure-test/route.test.ts"`, `npm run lint`, full `npm run test`.

16. Sprint 2: Simulation migration bundle (depends on Sprint 1)
17. Backend: add `backend/app/api/routes/simulation.py` with:
18. `GET/POST /api/v1/threads/{thread_id}/simulation`
19. `GET /api/v1/threads/{thread_id}/simulation/history`
20. Backend storage: simulation run create/latest/history helpers with response-shape parity.
21. Frontend proxy integration in:
22. `frontend/app/api/threads/[threadId]/simulation/route.ts`
23. `frontend/app/api/threads/[threadId]/simulation/history/route.ts`
24. Tests: add simulation route contract tests for proxy success, fallback, malformed payload, and not-found paths.
25. Verification: focused simulation tests, lint, full test suite, and frontend build.

26. Sprint 3: Decision-output + Failure-analysis migration (depends on Sprint 2)
27. Backend routes:
28. `backend/app/api/routes/decision_output.py`
29. `backend/app/api/routes/failure_analysis.py`
30. Frontend proxy integration:
31. `frontend/app/api/threads/[threadId]/decision-output/route.ts`
32. `frontend/app/api/threads/[threadId]/failure-analysis/route.ts`
33. Tests: add route contract matrix for proxy/fallback + 400/404 behavior.
34. Verification: lint, full tests, frontend build, short soak with proxy flag on.

35. Sprint 4: Export v1 foundation (depends on Sprints 1-3 stable)
36. Backend export routes:
37. `GET /api/v1/threads/{thread_id}/export`
38. `GET /api/v1/threads/export/all`
39. Frontend proxy routes:
40. `frontend/app/api/threads/[threadId]/export/route.ts`
41. `frontend/app/api/threads/export/all/route.ts`
42. Free export includes: rawInput(clarify snapshot), clarify, pressure-test, decision-output, failure-analysis; simulation omitted pre-auth.
43. Tests: per-thread export, all-thread bundle export, header assertions, omittedSections assertions.
44. Auth-dependent follow-up: enable paid simulation inclusion after user plan context is available.

