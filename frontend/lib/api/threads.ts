export type ThreadStatus = "active" | "revision" | "failed" | "completed";

export interface ClarifyDraft {
  title: string;
  coreProblem: string;
  desiredOutcome: string;
  context: string;
  constraints: string[];
  assumptions: string[];
}

export interface ThreadRecord {
  id: string;
  title: string;
  status: ThreadStatus;
  parentThreadId?: string;
  createdAt: string;
  updatedAt: string;
  clarifyDraft?: ClarifyDraft;
}

export interface GroupedThreads {
  active: ThreadRecord[];
  revisions: ThreadRecord[];
  failureAnalysis: ThreadRecord[];
  history: ThreadRecord[];
}

export interface PressureScenario {
  id: number;
  scenario: string;
  question: string;
  thinkAbout: string[];
}

export interface PressureResponse {
  scenarioId: number;
  answer: string;
  skipped: boolean;
  answeredAt: string;
}

export interface PressureTestState {
  scenarios: PressureScenario[];
  currentIndex: number;
  responses: Record<string, PressureResponse>;
  completed: boolean;
  updatedAt: string;
}

export interface SimulationVariableSet {
  price: string;
  targetMarket: string;
  marketingSpend: string;
  timeHorizon: string;
}

export interface SimulationRisk {
  label: string;
  percentage: number;
}

export interface SimulationResult {
  adoptionProjection: string;
  revenueProjection: string;
  competitorReaction: string;
  userPerception: string;
  insight: string;
  risks: SimulationRisk[];
}

export interface SimulationRun {
  id: string;
  variables: SimulationVariableSet;
  results: SimulationResult;
  createdAt: string;
}

export interface DecisionOutputData {
  decisionTitle: string;
  finalDecision: string;
  keyReasons: string[];
  keyRisks: string[];
  assumptions: string[];
  decisionStrength: number;
  strengths: string[];
  weakPoints: string[];
  suggestedExperiment: string;
}

export interface FailureAnalysisData {
  whatHappened: string;
  observations: string[];
  failedAssumptions: string[];
  rootCause: string;
  likelyRootCause: string;
  cognitiveBias: string;
  missedVariable: string;
  recommendation: string;
  updatedAt: string;
}

interface ApiErrorPayload {
  message?: string;
}

async function parseApiError(response: Response, fallbackMessage: string): Promise<never> {
  let message = fallbackMessage;
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload?.message) {
      message = payload.message;
    }
  } catch {
    // Keep fallback message when response body is not JSON.
  }

  throw new Error(message);
}

export async function fetchGroupedThreads(): Promise<GroupedThreads> {
  const response = await fetch("/api/threads?grouped=true", { cache: "no-store" });
  if (!response.ok) return parseApiError(response, "Failed to fetch threads");
  return response.json();
}

export async function createThread(payload?: { title?: string; parentThreadId?: string; status?: ThreadStatus }): Promise<ThreadRecord> {
  const response = await fetch("/api/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });

  if (!response.ok) return parseApiError(response, "Failed to create thread");
  return response.json();
}

export async function fetchClarifyDraft(threadId: string): Promise<ClarifyDraft | null> {
  const response = await fetch(`/api/threads/${threadId}/clarify-draft`, { cache: "no-store" });
  if (!response.ok) return parseApiError(response, "Failed to fetch clarify draft");
  const data = await response.json();
  return data.clarifyDraft;
}

export async function saveClarifyDraft(threadId: string, draft: ClarifyDraft): Promise<ClarifyDraft> {
  const response = await fetch(`/api/threads/${threadId}/clarify-draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });

  if (!response.ok) return parseApiError(response, "Failed to save clarify draft");
  const data = await response.json();
  return data.clarifyDraft;
}

export async function generatePressureTest(threadId: string): Promise<PressureTestState> {
  const response = await fetch(`/api/threads/${threadId}/pressure-test`, {
    method: "POST",
  });

  if (!response.ok) return parseApiError(response, "Failed to generate pressure test");
  const data = await response.json();
  return data.pressureTest;
}

export async function fetchPressureTest(threadId: string): Promise<PressureTestState | null> {
  const response = await fetch(`/api/threads/${threadId}/pressure-test`, {
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) return parseApiError(response, "Failed to fetch pressure test");
  const data = await response.json();
  return data.pressureTest;
}

export async function submitPressureAnswer(
  threadId: string,
  payload: { scenarioId: number; answer: string }
): Promise<PressureTestState> {
  const response = await fetch(`/api/threads/${threadId}/pressure-test/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return parseApiError(response, "Failed to submit pressure-test answer");
  const data = await response.json();
  return data.pressureTest;
}

export async function skipPressureTestScenario(
  threadId: string,
  payload: { scenarioId: number }
): Promise<PressureTestState> {
  const response = await fetch(`/api/threads/${threadId}/pressure-test/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return parseApiError(response, "Failed to skip pressure-test scenario");
  const data = await response.json();
  return data.pressureTest;
}

export async function fetchLatestSimulation(threadId: string): Promise<SimulationRun | null> {
  const response = await fetch(`/api/threads/${threadId}/simulation`, {
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) return parseApiError(response, "Failed to fetch latest simulation");
  const data = await response.json();
  return data.run;
}

export async function runThreadSimulation(
  threadId: string,
  payload: SimulationVariableSet
): Promise<SimulationRun> {
  const response = await fetch(`/api/threads/${threadId}/simulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return parseApiError(response, "Failed to run simulation");
  const data = await response.json();
  return data.run;
}

export async function fetchSimulationHistory(threadId: string): Promise<SimulationRun[]> {
  const response = await fetch(`/api/threads/${threadId}/simulation/history`, {
    cache: "no-store",
  });

  if (!response.ok) return parseApiError(response, "Failed to fetch simulation history");
  const data = await response.json();
  return data.runs;
}

export async function fetchDecisionOutput(threadId: string): Promise<DecisionOutputData> {
  const response = await fetch(`/api/threads/${threadId}/decision-output`, {
    cache: "no-store",
  });

  if (!response.ok) return parseApiError(response, "Failed to fetch decision output");
  const data = await response.json();
  return data.output;
}

export async function fetchFailureAnalysis(threadId: string): Promise<FailureAnalysisData> {
  const response = await fetch(`/api/threads/${threadId}/failure-analysis`, {
    cache: "no-store",
  });

  if (!response.ok) return parseApiError(response, "Failed to fetch failure analysis");
  const data = await response.json();
  return data.failureAnalysis;
}

export async function saveFailureAnalysis(
  threadId: string,
  payload: Pick<FailureAnalysisData, "whatHappened" | "observations" | "failedAssumptions" | "rootCause">
): Promise<FailureAnalysisData> {
  const response = await fetch(`/api/threads/${threadId}/failure-analysis`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return parseApiError(response, "Failed to save failure analysis");
  const data = await response.json();
  return data.failureAnalysis;
}

export interface DraftInsights {
  suggestions: string[];
  missing_elements: string[];
  biases: string[];
}

export async function analyzeDraft(data: {
  title: string;
  core_problem: string;
  context?: string;
  constraints?: string[];
  assumptions?: string[];
}): Promise<DraftInsights | null> {
  try {
    const response = await fetch("/api/analyze-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
