# Data Export Feature Spec (Tier-Based)

## Goal
Provide users with a downloadable export of their thread journey.

- **Free tier** gets:
  - Raw user input
  - Clarify data/output
  - Pressure test data
  - Decision output
  - Failure analysis
- **Paid tier** gets everything in Free **plus**:
  - Simulation runs/data

---

## Scope (v1)

### Supported format
- `JSON` only (first release)

### Endpoint
- `GET /threads/{thread_id}/export`

### Auth
- User must be authenticated
- User can export only their own thread

### Plan gating
- Determine plan from authenticated user context (`free` or `paid`)
- Filter sections by allowlist based on plan

---

## Section Rules by Plan

### Free
Include:
1. `rawInput`
2. `clarify`
3. `pressureTest`
4. `decisionOutput`
5. `failureAnalysis`

Exclude:
- `simulation`

### Paid
Include:
1. `rawInput`
2. `clarify`
3. `pressureTest`
4. `decisionOutput`
5. `failureAnalysis`
6. `simulation`

---

## Response Contract

```json
{
  "version": "v1",
  "tier": "free",
  "threadId": "t-123",
  "exportedAt": "2026-04-22T12:00:00Z",
  "sections": {
    "rawInput": {},
    "clarify": {},
    "pressureTest": {},
    "decisionOutput": {},
    "failureAnalysis": {}
  },
  "omittedSections": ["simulation"]
}
```

For paid tier, `sections.simulation` is included and `omittedSections` can be empty.

---

## Suggested Internal Mapping

Use a consistent section map from thread object:

- `rawInput` ← original user prompt/input block
- `clarify` ← `clarifyDraft` (or clarify result object)
- `pressureTest` ← pressure-test state/results
- `decisionOutput` ← final recommendation/decision payload
- `failureAnalysis` ← risk/failure analysis payload
- `simulation` ← simulation inputs + runs + summaries

If any included section is missing in data, return it as `{}` or `null` consistently.

---

## HTTP Behavior

### Success
- `200 OK`
- Headers:
  - `Content-Type: application/json`
  - `Content-Disposition: attachment; filename="thread-{threadId}-export-{YYYY-MM-DD}.json"`

### Not Found
- `404` if thread doesn’t exist or not owned by user

### Unauthorized/Forbidden
- `401` unauthenticated
- `403` authenticated but no access

### Validation/Internal errors
- `400` for invalid request params
- `500` for unexpected failures

---

## Security & Privacy

- Never export secrets/tokens/internal keys
- Remove internal-only fields (debug-only data, cache internals)
- Ensure ownership check before read/export
- Add audit log event: `thread_export_requested`

---

## Frontend UX

### Button
- Add **Export Data** button on thread page

### Behavior
1. Call frontend API route: `/api/threads/{id}/export`
2. Route proxies backend export endpoint
3. Trigger browser download

### Free tier messaging
- Show helper text:
  - “Simulation export is available on Paid plan.”

---

## Frontend Proxy Route (Strangler-Compatible)

Create:
- `frontend/app/api/threads/[threadId]/export/route.ts`

Behavior:
- Proxy to backend first
- Optional fallback to local store during migration
- Preserve response status + headers for file download

---

## Minimal Backend Pseudocode

```python
@router.get("/threads/{thread_id}/export")
async def export_thread(thread_id: str, user=Depends(current_user)):
    thread = get_thread_for_user(thread_id, user.id)
    if not thread:
        return JSONResponse({"message": "Thread not found"}, status_code=404)

    tier = user.plan  # "free" | "paid"

    sections = {
        "rawInput": thread.get("rawInput"),
        "clarify": thread.get("clarifyDraft"),
        "pressureTest": thread.get("pressureTest"),
        "decisionOutput": thread.get("decisionOutput"),
        "failureAnalysis": thread.get("failureAnalysis"),
        "simulation": thread.get("simulation"),
    }

    allowed = ["rawInput", "clarify", "pressureTest", "decisionOutput", "failureAnalysis"]
    if tier == "paid":
        allowed.append("simulation")

    filtered = {k: sections.get(k) for k in allowed}
    omitted = [k for k in sections.keys() if k not in allowed]

    payload = {
        "version": "v1",
        "tier": tier,
        "threadId": thread_id,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "sections": filtered,
        "omittedSections": omitted,
    }

    filename = f"thread-{thread_id}-export-{date.today().isoformat()}.json"
    return Response(
        content=json.dumps(payload),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

---

## Test Cases

### Free plan
- Export includes required 5 sections
- `simulation` excluded
- `omittedSections` contains `simulation`

### Paid plan
- Export includes simulation section

### Access control
- User cannot export another user’s thread

### Stability
- Missing optional section does not crash export
- Filename and headers set correctly

---

## Versioning

- Start with `"version": "v1"`
- Future schema changes should increment version (`v2`, etc.) and maintain backward compatibility strategy.

---

## Rollout Plan

1. Implement backend endpoint + tests
2. Add frontend proxy route
3. Add Export button + download handling
4. Add free-tier lock messaging for simulation
5. Release behind feature flag (optional)
6. Monitor export usage and failures