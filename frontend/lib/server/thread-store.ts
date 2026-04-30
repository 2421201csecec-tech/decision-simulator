import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ThreadStatus = "active" | "revision" | "failed" | "completed";

export interface ClarifyDraft {
  title: string;
  coreProblem: string;
  desiredOutcome: string;
  context: string;
  constraints: string[];
  assumptions: string[];
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
}

export interface SimulationExplanation {
  verdict: string;
  key_assumption: string;
  // Per-case bullet arrays (optional — old stored runs may not have these)
  ideal_case?: string[];
  base_case?: string[];
  worst_case?: string[];
}

export interface SimulationRun {
  id: string;
  createdAt: string;
  // Legacy v1 — manual input; old stored runs still use these
  variables?: SimulationVariableSet;
  results?: SimulationResult;
  // v2 — extraction-driven Monte Carlo
  options?: SimulationOption[];
  confidence?: number;
  winner_id?: string | null;
  key_variable_id?: string | null;
  explanation?: SimulationExplanation | null;
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

export interface ThreadRecord {
  id: string;
  title: string;
  status: ThreadStatus;
  parentThreadId?: string;
  createdAt: string;
  updatedAt: string;
  clarifyDraft?: ClarifyDraft;
  pressureTest?: PressureTestState;
  simulationRuns?: SimulationRun[];
  failureAnalysis?: FailureAnalysisData;
  extractionSchema?: Record<string, unknown>;
  decisionOutput?: DecisionOutputData;
}

interface StoreData {
  threads: ThreadRecord[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "threads.json");

const EMPTY_STORE: StoreData = {
  threads: [],
};

const DEFAULT_PRESSURE_SCENARIOS: PressureScenario[] = [
  {
    id: 1,
    scenario: "A competitor launches a similar product at Rs 999.",
    question: "How does your pricing decision hold in this case?",
    thinkAbout: ["Value perception", "User expectations", "Long-term strategy"],
  },
  {
    id: 2,
    scenario: "Your target customers report the product is too expensive.",
    question: "What adjustments would you consider to your pricing model?",
    thinkAbout: ["Customer segments", "Price elasticity", "Feature bundling"],
  },
  {
    id: 3,
    scenario: "A major investor questions your pricing strategy in a pitch meeting.",
    question: "How do you defend your pricing decision?",
    thinkAbout: ["Unit economics", "Market positioning", "Growth potential"],
  },
  {
    id: 4,
    scenario: "Your CAC increases by 40% due to market changes.",
    question: "Does your pricing still support sustainable growth?",
    thinkAbout: ["LTV:CAC ratio", "Payback period", "Margin adjustment"],
  },
  {
    id: 5,
    scenario: "A key distribution partner asks for a 30% revenue share.",
    question: "How does this affect your pricing viability?",
    thinkAbout: ["Partnership value", "Margin protection", "Alternative channels"],
  },
  {
    id: 6,
    scenario: "Market research shows users would pay 2x more for premium features.",
    question: "Should you pivot to a tiered pricing model?",
    thinkAbout: ["Feature differentiation", "Conversion rates", "Revenue optimization"],
  },
];

async function ensureStore(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
  }
}

async function readStore(): Promise<StoreData> {
  await ensureStore();
  const raw = await readFile(DATA_FILE, "utf8");
  try {
    return JSON.parse(raw) as StoreData;
  } catch {
    return EMPTY_STORE;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  await ensureStore();
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export interface GroupedThreads {
  active: ThreadRecord[];
  revisions: ThreadRecord[];
  failureAnalysis: ThreadRecord[];
  history: ThreadRecord[];
}

export async function getAllThreads(): Promise<ThreadRecord[]> {
  const data = await readStore();
  return data.threads;
}

export async function getGroupedThreads(): Promise<GroupedThreads> {
  const data = await readStore();
  const grouped: GroupedThreads = {
    active: [],
    revisions: [],
    failureAnalysis: [],
    history: [],
  };

  for (const thread of data.threads) {
    if (thread.status === "active") {
      grouped.active.push(thread);
    } else if (thread.status === "revision") {
      grouped.revisions.push(thread);
    } else if (thread.status === "failed") {
      grouped.failureAnalysis.push(thread);
    } else {
      grouped.history.push(thread);
    }
  }

  return grouped;
}

export async function createThread(payload?: { title?: string; parentThreadId?: string; status?: ThreadStatus }): Promise<ThreadRecord> {
  const data = await readStore();
  const now = new Date().toISOString();
  const status = payload?.status ?? (payload?.parentThreadId ? "revision" : "active");

  const thread: ThreadRecord = {
    id: crypto.randomUUID(),
    title: payload?.title?.trim() || "Untitled Decision",
    status,
    parentThreadId: payload?.parentThreadId,
    createdAt: now,
    updatedAt: now,
    clarifyDraft: {
      title: payload?.title?.trim() || "",
      coreProblem: "",
      desiredOutcome: "",
      context: "",
      constraints: [],
      assumptions: [],
    },
  };

  data.threads.unshift(thread);
  await writeStore(data);
  return thread;
}

export async function getThreadById(threadId: string): Promise<ThreadRecord | null> {
  const data = await readStore();
  return data.threads.find((thread) => thread.id === threadId) ?? null;
}

export async function saveClarifyDraft(threadId: string, draft: ClarifyDraft): Promise<ThreadRecord | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  const title = draft.title?.trim();
  const wasFailed = data.threads[index].status === "failed";

  // Clarify edits invalidate downstream derived artifacts so UI can recompute safely.
  data.threads[index] = {
    ...data.threads[index],
    status: wasFailed ? "active" : data.threads[index].status,
    title: title || data.threads[index].title,
    clarifyDraft: {
      title: draft.title || "",
      coreProblem: draft.coreProblem || "",
      desiredOutcome: draft.desiredOutcome || "",
      context: draft.context || "",
      constraints: draft.constraints || [],
      assumptions: draft.assumptions || [],
    },
    pressureTest: undefined,
    simulationRuns: undefined,
    failureAnalysis: undefined,
    extractionSchema: undefined,
    decisionOutput: undefined,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(data);
  return data.threads[index];
}

function createDefaultPressureState(): PressureTestState {
  return {
    scenarios: DEFAULT_PRESSURE_SCENARIOS,
    currentIndex: 0,
    responses: {},
    completed: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function generatePressureTest(threadId: string, aiScenarios?: PressureScenario[]): Promise<ThreadRecord | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  if (!data.threads[index].pressureTest) {
    const scenarios = aiScenarios && aiScenarios.length > 0 ? aiScenarios : DEFAULT_PRESSURE_SCENARIOS;
    data.threads[index] = {
      ...data.threads[index],
      pressureTest: {
        scenarios,
        currentIndex: 0,
        responses: {},
        completed: false,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    await writeStore(data);
  }

  return data.threads[index];
}

export async function saveExtractionSchema(threadId: string, schema: Record<string, unknown>): Promise<void> {
  const data = await readStore();
  const index = data.threads.findIndex((t) => t.id === threadId);
  if (index === -1) return;
  data.threads[index] = { ...data.threads[index], extractionSchema: schema, updatedAt: new Date().toISOString() };
  await writeStore(data);
}

export async function saveDecisionOutput(threadId: string, output: DecisionOutputData): Promise<void> {
  const data = await readStore();
  const index = data.threads.findIndex((t) => t.id === threadId);
  if (index === -1) return;
  data.threads[index] = { ...data.threads[index], decisionOutput: output, updatedAt: new Date().toISOString() };
  await writeStore(data);
}

export async function getPressureTest(threadId: string): Promise<PressureTestState | null> {
  const thread = await getThreadById(threadId);
  return thread?.pressureTest ?? null;
}

export async function submitPressureAnswer(
  threadId: string,
  scenarioId: number,
  answer: string
): Promise<PressureTestState | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  const pressureTest = data.threads[index].pressureTest ?? createDefaultPressureState();
  const currentScenario = pressureTest.scenarios[pressureTest.currentIndex];

  if (!currentScenario || currentScenario.id !== scenarioId) {
    return pressureTest;
  }

  pressureTest.responses[String(scenarioId)] = {
    scenarioId,
    answer: answer.trim(),
    skipped: false,
    answeredAt: new Date().toISOString(),
  };

  if (pressureTest.currentIndex < pressureTest.scenarios.length - 1) {
    pressureTest.currentIndex += 1;
  } else {
    pressureTest.completed = true;
  }

  pressureTest.updatedAt = new Date().toISOString();

  data.threads[index] = {
    ...data.threads[index],
    pressureTest,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(data);
  return pressureTest;
}

export async function skipPressureScenario(
  threadId: string,
  scenarioId: number
): Promise<PressureTestState | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  const pressureTest = data.threads[index].pressureTest ?? createDefaultPressureState();
  const currentScenario = pressureTest.scenarios[pressureTest.currentIndex];

  if (!currentScenario || currentScenario.id !== scenarioId) {
    return pressureTest;
  }

  pressureTest.responses[String(scenarioId)] = {
    scenarioId,
    answer: "",
    skipped: true,
    answeredAt: new Date().toISOString(),
  };

  if (pressureTest.currentIndex < pressureTest.scenarios.length - 1) {
    pressureTest.currentIndex += 1;
  } else {
    pressureTest.completed = true;
  }

  pressureTest.updatedAt = new Date().toISOString();

  data.threads[index] = {
    ...data.threads[index],
    pressureTest,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(data);
  return pressureTest;
}

function parseCurrencyValue(input: string): number {
  const numeric = Number(input.replace(/[^0-9]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function estimateSimulationResult(variables: SimulationVariableSet): SimulationResult {
  const price = parseCurrencyValue(variables.price);
  const spend = parseCurrencyValue(variables.marketingSpend);

  let score = 50;

  if (variables.targetMarket === "Early Adopters") score += 8;
  if (variables.targetMarket === "Mass Market") score += 3;
  if (variables.targetMarket === "Enterprise") score -= 2;

  if (price <= 1499) score += 8;
  else if (price <= 1999) score += 5;
  else if (price <= 2499) score += 1;
  else score -= 6;

  if (spend >= 100000) score += 8;
  else if (spend >= 50000) score += 4;
  else score -= 3;

  if (variables.timeHorizon === "6 Months") score += 4;
  if (variables.timeHorizon === "1 Month") score -= 2;

  score = Math.max(10, Math.min(90, score));

  const adoptionProjection = score >= 70 ? "High" : score >= 55 ? "Medium-High" : score >= 40 ? "Medium" : "Low";
  const baseRevenueLow = Math.round((score * 4500) / 100) * 100;
  const baseRevenueHigh = baseRevenueLow + Math.round(baseRevenueLow * 0.45);

  const revenueProjection = `Rs ${(baseRevenueLow / 100000).toFixed(1)}L - Rs ${(baseRevenueHigh / 100000).toFixed(1)}L in first ${variables.timeHorizon.toLowerCase()}`;
  const competitorReaction = price <= 1999
    ? "Likely price undercut by smaller tools"
    : "Moderate pushback from value-focused competitors";
  const userPerception = price >= 2499 ? "Premium but potentially expensive" : "Affordable but still premium";

  const lowAdoptionRisk = Math.max(15, 70 - score);
  const competitorUndercutRisk = price <= 1999 ? 45 : 32;
  const pricingAdjustmentNeed = Math.max(25, Math.min(80, Math.round((price / 2600) * 55)));

  const insight = price <= 1999
    ? "Lower pricing increases early adoption but weakens premium positioning. Consider testing Rs 2199 as midpoint pricing."
    : "Premium pricing protects brand perception but may slow early adoption. Consider a limited-time entry offer.";

  return {
    adoptionProjection,
    revenueProjection,
    competitorReaction,
    userPerception,
    insight,
    risks: [
      { label: "Low Adoption Risk", percentage: lowAdoptionRisk },
      { label: "Competitor Undercut", percentage: competitorUndercutRisk },
      { label: "Pricing Adjustment Need", percentage: pricingAdjustmentNeed },
    ],
  };
}

export async function runSimulation(
  threadId: string,
  variables: SimulationVariableSet
): Promise<SimulationRun | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  const run: SimulationRun = {
    id: crypto.randomUUID(),
    variables,
    results: estimateSimulationResult(variables),
    createdAt: new Date().toISOString(),
  };

  const existingRuns = data.threads[index].simulationRuns ?? [];
  data.threads[index] = {
    ...data.threads[index],
    simulationRuns: [run, ...existingRuns],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(data);
  return run;
}

export async function runExtractionSimulation(
  threadId: string,
  result: Pick<SimulationRun, "options" | "confidence" | "winner_id" | "key_variable_id" | "explanation">
): Promise<SimulationRun | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  const run: SimulationRun = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...result,
  };

  const existingRuns = data.threads[index].simulationRuns ?? [];
  data.threads[index] = {
    ...data.threads[index],
    simulationRuns: [run, ...existingRuns],
    updatedAt: new Date().toISOString(),
  };

  await writeStore(data);
  return run;
}

export async function getLatestSimulation(threadId: string): Promise<SimulationRun | null> {
  const thread = await getThreadById(threadId);
  return thread?.simulationRuns?.[0] ?? null;
}

export async function getSimulationHistory(threadId: string): Promise<SimulationRun[] | null> {
  const thread = await getThreadById(threadId);
  if (!thread) return null;
  return thread.simulationRuns ?? [];
}

export async function getDecisionOutputData(threadId: string): Promise<DecisionOutputData | null> {
  const thread = await getThreadById(threadId);
  if (!thread) return null;

  const draft = thread.clarifyDraft;
  const latestSimulation = thread.simulationRuns?.[0];
  const pressureResponses = Object.values(thread.pressureTest?.responses ?? {}).filter(
    (response) => !response.skipped && response.answer.trim().length > 0
  );

  // v1 simulation run has variables/results; v2 has options. Guard accordingly.
  const legacySim = latestSimulation?.variables && latestSimulation?.results ? latestSimulation : null;

  const decisionTitle = draft?.title?.trim() || thread.title;
  const finalDecision = legacySim
    ? `Proceed with ${legacySim.variables!.price} pricing for ${legacySim.variables!.targetMarket} over ${legacySim.variables!.timeHorizon.toLowerCase()}.`
    : "Run simulation to finalize decision direction.";

  const keyReasons: string[] = [];
  if (draft?.coreProblem) {
    keyReasons.push(`Core objective: ${draft.coreProblem}`);
  }
  if (pressureResponses.length > 0) {
    keyReasons.push("Pressure-test responses show scenario awareness and adaptability.");
  }
  if (legacySim) {
    keyReasons.push(`Simulation indicates ${legacySim.results!.adoptionProjection.toLowerCase()} adoption potential.`);
  }
  if (keyReasons.length === 0) {
    keyReasons.push("Initial reasoning has been captured and is ready for validation.");
  }

  const keyRisks: string[] = [];
  if (legacySim) {
    const topRisk = [...legacySim.results!.risks].sort((a, b) => b.percentage - a.percentage)[0];
    if (topRisk) {
      keyRisks.push(`${topRisk.label} at ${topRisk.percentage}%.`);
    }
    keyRisks.push(legacySim.results!.competitorReaction);
  } else {
    keyRisks.push("No simulation run yet; risk profile is incomplete.");
  }

  const assumptions = draft?.assumptions?.slice(0, 3) ?? [];
  if (assumptions.length === 0) {
    assumptions.push("Assumptions are pending definition in Clarify stage.");
  }

  const baseStrengthFromSimulation = legacySim
    ? 100 - Math.round(legacySim.results!.risks.reduce((sum, risk) => sum + risk.percentage, 0) / legacySim.results!.risks.length)
    : 45;
  const pressureBonus = Math.min(20, pressureResponses.length * 4);
  const decisionStrength = Math.max(20, Math.min(95, baseStrengthFromSimulation + pressureBonus));

  const strengths: string[] = [];
  if (legacySim?.results?.adoptionProjection.includes("High")) {
    strengths.push("Projected adoption trend is favorable.");
  }
  strengths.push("Decision path is grounded in structured stages.");
  if (pressureResponses.length >= 3) {
    strengths.push("Multiple pressure scenarios were handled with explicit reasoning.");
  }

  const weakPoints: string[] = [];
  if (legacySim) {
    legacySim.results!.risks
      .filter((risk) => risk.percentage >= 40)
      .forEach((risk) => weakPoints.push(`${risk.label} remains elevated (${risk.percentage}%).`));
  }
  if (weakPoints.length === 0) {
    weakPoints.push("No major weak point flagged yet; continue validating assumptions.");
  }

  const suggestedExperiment = legacySim
    ? legacySim.results!.insight
    : "Run the simulation with at least two variable combinations to compare risk spread.";

  return {
    decisionTitle,
    finalDecision,
    keyReasons,
    keyRisks,
    assumptions,
    decisionStrength,
    strengths,
    weakPoints,
    suggestedExperiment,
  };
}

function deriveFailureInsights(input: {
  whatHappened: string;
  observations: string[];
  failedAssumptions: string[];
  rootCause: string;
}): Pick<FailureAnalysisData, "likelyRootCause" | "cognitiveBias" | "missedVariable" | "recommendation"> {
  const signal = `${input.whatHappened} ${input.rootCause} ${input.observations.join(" ")} ${input.failedAssumptions.join(" ")}`.toLowerCase();

  const likelyRootCause = signal.includes("price") || signal.includes("pricing")
    ? "Overestimated willingness to pay"
    : signal.includes("execution")
      ? "Execution mismatch between plan and rollout"
      : "Mismatch between assumptions and real-world response";

  const cognitiveBias = signal.includes("assum") || signal.includes("confident")
    ? "Overconfidence bias detected"
    : "Confirmation bias risk detected";

  const missedVariable = signal.includes("competitor")
    ? "Competitor pricing dynamics"
    : signal.includes("market")
      ? "Market demand volatility"
      : "External environment shift";

  const recommendation = signal.includes("price")
    ? "Test pricing ladder: Rs 1499 / Rs 1999 / Rs 2499"
    : "Run a controlled experiment with smaller rollout and explicit success criteria.";

  return {
    likelyRootCause,
    cognitiveBias,
    missedVariable,
    recommendation,
  };
}

function createDefaultFailureAnalysis(thread: ThreadRecord): FailureAnalysisData {
  const assumptions = thread.clarifyDraft?.assumptions ?? [];

  return {
    whatHappened: "",
    observations: [
      "Market rejected pricing",
      "Competitor launched cheaper alternative",
      "Users did not see enough value",
    ],
    failedAssumptions: assumptions.length > 0
      ? assumptions.slice(0, 2)
      : ["Users would accept premium pricing", "Brand perceived as premium"],
    rootCause: "",
    likelyRootCause: "Overestimated willingness to pay",
    cognitiveBias: "Overconfidence bias detected",
    missedVariable: "Competitor pricing dynamics",
    recommendation: "Test pricing ladder: Rs 1499 / Rs 1999 / Rs 2499",
    updatedAt: new Date().toISOString(),
  };
}

export async function getFailureAnalysis(threadId: string): Promise<FailureAnalysisData | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  if (!data.threads[index].failureAnalysis) {
    data.threads[index] = {
      ...data.threads[index],
      failureAnalysis: createDefaultFailureAnalysis(data.threads[index]),
      updatedAt: new Date().toISOString(),
    };
    await writeStore(data);
  }

  return data.threads[index].failureAnalysis ?? null;
}

export async function saveFailureAnalysis(
  threadId: string,
  payload: Pick<FailureAnalysisData, "whatHappened" | "observations" | "failedAssumptions" | "rootCause">
): Promise<FailureAnalysisData | null> {
  const data = await readStore();
  const index = data.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) return null;

  const derived = deriveFailureInsights(payload);
  const failureAnalysis: FailureAnalysisData = {
    whatHappened: payload.whatHappened,
    observations: payload.observations,
    failedAssumptions: payload.failedAssumptions,
    rootCause: payload.rootCause,
    ...derived,
    updatedAt: new Date().toISOString(),
  };

  data.threads[index] = {
    ...data.threads[index],
    status: "failed",
    failureAnalysis,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(data);
  return failureAnalysis;
}
