# Phase A Contract Freeze (Do Not Break Baseline)

This document freezes the current frontend-visible API contracts before strangler migration.

## Scope

- Threads
- Clarify draft
- Pressure test (generate, answer, skip)
- Simulation (latest, run, history)
- Decision output
- Failure analysis

## Global Error Shape

When validation or business constraints fail, current routes return:

```json
{
  "message": "string"
}
```

## Threads

### GET /api/threads

- Query: grouped=true|false (optional)

Success (grouped=true):

```json
{
  "active": [],
  "revisions": [],
  "failureAnalysis": [],
  "history": []
}
```

Success (grouped omitted/false):

```json
{
  "threads": []
}
```

### POST /api/threads

Request body (optional):

```json
{
  "title": "optional string",
  "parentThreadId": "optional uuid",
  "status": "optional active|revision|failed|completed"
}
```

Success: 201

```json
{
  "id": "uuid",
  "title": "string",
  "status": "active|revision|failed|completed",
  "parentThreadId": "optional uuid",
  "createdAt": "ISO string",
  "updatedAt": "ISO string",
  "clarifyDraft": {
    "title": "string",
    "coreProblem": "string",
    "desiredOutcome": "string",
    "context": "string",
    "constraints": [],
    "assumptions": []
  }
}
```

Errors:
- 400 {"message":"Invalid payload"} for malformed JSON
- 400 {"message":"..."} for schema validation failure

## Clarify Draft

### GET /api/threads/:threadId/clarify-draft

Success: 200

```json
{
  "threadId": "uuid",
  "clarifyDraft": {
    "title": "string",
    "coreProblem": "string",
    "desiredOutcome": "string",
    "context": "string",
    "constraints": [],
    "assumptions": []
  }
}
```

Not found: 404 {"message":"Thread not found"}

### PUT /api/threads/:threadId/clarify-draft

Request:

```json
{
  "title": "string",
  "coreProblem": "string",
  "desiredOutcome": "string",
  "context": "string",
  "constraints": ["string"],
  "assumptions": ["string"]
}
```

Success: 200

```json
{
  "threadId": "uuid",
  "clarifyDraft": {
    "title": "string",
    "coreProblem": "string",
    "desiredOutcome": "string",
    "context": "string",
    "constraints": [],
    "assumptions": []
  }
}
```

Errors:
- 400 {"message":"Invalid payload"}
- 400 {"message":"..."} schema validation issue
- 404 {"message":"Thread not found"}

## Pressure Test

### GET /api/threads/:threadId/pressure-test

Success: 200

```json
{
  "pressureTest": {
    "scenarios": [],
    "currentIndex": 0,
    "responses": {},
    "completed": false,
    "updatedAt": "ISO string"
  }
}
```

Not found: 404 {"message":"Pressure test not found"}

### POST /api/threads/:threadId/pressure-test

Success: 200

```json
{
  "pressureTest": {
    "scenarios": [],
    "currentIndex": 0,
    "responses": {},
    "completed": false,
    "updatedAt": "ISO string"
  }
}
```

Not found: 404 {"message":"Thread not found"}

### POST /api/threads/:threadId/pressure-test/answer

Request:

```json
{
  "scenarioId": 1,
  "answer": "string"
}
```

Success: 200

```json
{
  "pressureTest": {
    "scenarios": [],
    "currentIndex": 0,
    "responses": {},
    "completed": false,
    "updatedAt": "ISO string"
  }
}
```

Errors:
- 400 invalid payload
- 404 pressure test not found
- 409 pressure test completed
- 409 scenario mismatch

### POST /api/threads/:threadId/pressure-test/skip

Request:

```json
{
  "scenarioId": 1
}
```

Success: 200

```json
{
  "pressureTest": {
    "scenarios": [],
    "currentIndex": 0,
    "responses": {},
    "completed": false,
    "updatedAt": "ISO string"
  }
}
```

Errors:
- 400 invalid payload
- 404 pressure test not found
- 409 pressure test completed
- 409 scenario mismatch

## Simulation

### GET /api/threads/:threadId/simulation

Success: 200

```json
{
  "run": {
    "id": "uuid",
    "variables": {
      "price": "string",
      "targetMarket": "string",
      "marketingSpend": "string",
      "timeHorizon": "string"
    },
    "results": {
      "adoptionProjection": "string",
      "revenueProjection": "string",
      "competitorReaction": "string",
      "userPerception": "string",
      "insight": "string",
      "risks": []
    },
    "createdAt": "ISO string"
  }
}
```

Not found: 404 {"message":"Simulation run not found"}

### POST /api/threads/:threadId/simulation

Request:

```json
{
  "price": "Rs 50,000",
  "targetMarket": "Early Adopters|Mass Market|Enterprise",
  "marketingSpend": "Rs 20,000",
  "timeHorizon": "1 Month|3 Months|6 Months"
}
```

Success: 201

```json
{
  "run": {
    "id": "uuid",
    "variables": {},
    "results": {},
    "createdAt": "ISO string"
  }
}
```

Errors:
- 400 invalid payload
- 404 thread not found

### GET /api/threads/:threadId/simulation/history

Success: 200

```json
{
  "runs": []
}
```

Not found: 404 {"message":"Thread not found"}

## Decision Output

### GET /api/threads/:threadId/decision-output

Success: 200

```json
{
  "output": {
    "decisionTitle": "string",
    "finalDecision": "string",
    "keyReasons": [],
    "keyRisks": [],
    "assumptions": [],
    "decisionStrength": 0,
    "strengths": [],
    "weakPoints": [],
    "suggestedExperiment": "string"
  }
}
```

Not found: 404 {"message":"Thread not found"}

## Failure Analysis

### GET /api/threads/:threadId/failure-analysis

Success: 200

```json
{
  "failureAnalysis": {
    "whatHappened": "string",
    "observations": [],
    "failedAssumptions": [],
    "rootCause": "string",
    "likelyRootCause": "string",
    "cognitiveBias": "string",
    "missedVariable": "string",
    "recommendation": "string",
    "updatedAt": "ISO string"
  }
}
```

Not found: 404 {"message":"Thread not found"}

### PUT /api/threads/:threadId/failure-analysis

Request:

```json
{
  "whatHappened": "string",
  "observations": ["string"],
  "failedAssumptions": ["string"],
  "rootCause": "string"
}
```

Success: 200

```json
{
  "failureAnalysis": {
    "whatHappened": "string",
    "observations": [],
    "failedAssumptions": [],
    "rootCause": "string",
    "likelyRootCause": "string",
    "cognitiveBias": "string",
    "missedVariable": "string",
    "recommendation": "string",
    "updatedAt": "ISO string"
  }
}
```

Errors:
- 400 invalid payload
- 404 thread not found
