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

export interface RootProbe {
  id: string;
  parentId: string;
  depth: number;
  question: string;
  probeType: string;
  status: "open" | "answered" | "skipped";
  answer: string | null;
}

export interface RootScenario {
  id: number;
  failure_vector: "execution" | "financial" | "external";
  scenario: string;
  question: string;
  think_about: string[];
  priority: number;
  probe_depth: number;
  probes: RootProbe[];
  status: "open" | "probing" | "closed";
  commitment: string | null;
  answer: string | null;
}

export interface PressureTestState {
  // v1 fields
  scenarios: PressureScenario[];
  currentIndex: number;
  responses: Record<string, PressureResponse>;
  completed: boolean;
  updatedAt: string;
  // v2 fields (optional)
  rootScenarios?: RootScenario[];
  enriched?: boolean;
  synthesized?: boolean;
  summary?: Record<string, unknown> | null;
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

export interface SimulationOption {
  id: string;
  label: string;
  mean: number;
  std: number;
  downside: number;
  cvar: number;
  upside: number;
  score: number;
  best_case: number;
  base_case: number;
  worst_case: number;
  histogram?: [number, number][]; // [bin_center, density] — 50 bins from Monte Carlo
}

export interface ExplanationBullet {
  title: string;
  description: string;
  tag: string;
}

export interface SimulationExplanation {
  verdict: string;
  key_assumption: string;
  ideal_case?: ExplanationBullet[];
  base_case?: ExplanationBullet[];
  worst_case?: ExplanationBullet[];
}

export interface SimulationRun {
  id: string;
  createdAt: string;
  // Legacy v1 — manual input
  variables?: SimulationVariableSet;
  results?: SimulationResult;
  // v2 — extraction-driven Monte Carlo
  options?: SimulationOption[];
  confidence?: number;
  winner_id?: string | null;
  key_variable_id?: string | null;
  explanation?: SimulationExplanation | null;
}

export interface ExtractionVariable {
  variable_id: string;
  name: string;
  type: "continuous" | "ordinal" | "categorical" | "boolean";
  range?: [number, number];
  possible_values?: string[];
  importance: "critical" | "high" | "medium" | "low";
  direction: "maximize" | "minimize";
  extraction_confidence: number;
  unit?: string;
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

export interface AssumptionGap {
  text: string;
  verdict: "held" | "partial" | "broke";
  why: string;
}

export interface FailureLesson {
  statement: string;
  patternType: string;
  isNew: boolean;
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
  failureType?: "assumption" | "execution" | "external_shock" | "framing" | null;
  assumptionGaps?: AssumptionGap[] | null;
  lessons?: FailureLesson[] | null;
  snapshot?: Record<string, unknown> | null;
  updatedAt: string;
}

export interface PatternProfile {
  patterns: Array<{
    pattern: string;
    pattern_type: string;
    seen_in: string[];
    count: number;
    first_seen: string;
    last_seen: string;
  }>;
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
  payload: { scenarioId: number; answer: string; probeId?: string | null }
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
  payload: { scenarioId: number; probeId?: string | null }
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

export async function fetchSimulationState(threadId: string): Promise<{
  run: SimulationRun | null;
  extractionSchema: Record<string, unknown> | null;
}> {
  const response = await fetch(`/api/threads/${threadId}/simulation`, { cache: "no-store" });
  if (response.status === 404) return { run: null, extractionSchema: null };
  if (!response.ok) return parseApiError(response, "Failed to fetch simulation");
  const data = await response.json();
  return { run: data.run ?? null, extractionSchema: data.extractionSchema ?? null };
}

export async function fetchLatestSimulation(threadId: string): Promise<SimulationRun | null> {
  const { run } = await fetchSimulationState(threadId);
  return run;
}

export async function runThreadSimulation(
  threadId: string,
  userValues: Record<string, number> = {}
): Promise<SimulationRun> {
  const response = await fetch(`/api/threads/${threadId}/simulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_values: userValues }),
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

export interface FailureIntakePayload {
  whatHappened: string;
  expectedOutcome: string;
  whatDid: string;
  biggestSurprise: string;
  observations: string[];
  failedAssumptions: string[];
  rootCause: string;
}

export async function saveFailureAnalysis(
  threadId: string,
  payload: FailureIntakePayload
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

export async function fetchPatternProfile(threadId: string): Promise<PatternProfile> {
  const response = await fetch(`/api/threads/${threadId}/pattern-profile`, {
    cache: "no-store",
  });
  if (!response.ok) return { patterns: [] };
  return response.json();
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

export async function triggerExtraction(
  threadId: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`/api/threads/${threadId}/extract`, {
      method: "POST",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.extractionSchema ?? null;
  } catch {
    return null;
  }
}
