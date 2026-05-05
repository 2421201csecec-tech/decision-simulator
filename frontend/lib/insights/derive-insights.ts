import type { PressureTestState } from "@/lib/api/threads";

interface ClarifyDraft {
  title?: string;
  coreProblem?: string;
  context?: string;
  constraints?: string[];
  assumptions?: string[];
}

export interface InsightState {
  suggestions: string[];
  keyRisks: string[];
  thinkAbout: string[];
  thinkingPattern: string[];
}

// Collect only human-typed answer strings from roots + probes
function collectAnswerTexts(pressureTest: PressureTestState): string[] {
  const roots = pressureTest.rootScenarios ?? [];
  return [
    ...roots.filter((r) => r.answer).map((r) => r.answer!),
    ...roots.flatMap((r) => r.probes.filter((p) => p.answer).map((p) => p.answer!)),
  ];
}

function deriveThinkingPattern(pressureTest: PressureTestState): string[] {
  const answerTexts = collectAnswerTexts(pressureTest);
  if (answerTexts.length === 0) return [];

  const total = answerTexts.length;
  const patterns: string[] = [];

  const specificCount = answerTexts.filter((a) => /\d+/.test(a)).length;
  if (specificCount / total >= 0.6) {
    patterns.push("Numeric and concrete — uses data when challenged");
  } else {
    patterns.push("Directional but light on specifics");
  }

  const commitCount = answerTexts.filter((a) =>
    /\bwill\b|\bcommit\b|\bplan to\b|\bgoing to\b|\bintend to\b/i.test(a)
  ).length;
  if (commitCount / total >= 0.5) {
    patterns.push("States clear intentions under pressure");
  }

  const fallbackCount = answerTexts.filter((a) =>
    /\bfallback\b|\bplan b\b|\balternative\b|\bif that fails\b|\bpivot\b|\bbut if\b/i.test(a)
  ).length;
  if (fallbackCount >= 1) {
    patterns.push("Risk-aware — mentions fallback scenarios");
  } else {
    patterns.push("Optimistic framing — fallback plans not stated");
  }

  const evidenceCount = answerTexts.filter((a) =>
    /\bdata\b|\bresearch\b|\bsurvey\b|\btest\b|\bvalidat\b|\bmetric\b|\banalytics\b/i.test(a)
  ).length;
  if (evidenceCount >= 1) {
    patterns.push("Evidence-referenced — cites data or research");
  }

  return patterns.slice(0, 4);
}

function deriveSuggestions(
  clarifyDraft: ClarifyDraft | null | undefined,
  extractionSchema: Record<string, unknown> | null | undefined,
  pressureTest: PressureTestState | null | undefined
): string[] {
  const suggestions: string[] = [];

  // From fragile assumptions in extraction schema
  const assumptions = (extractionSchema?.assumptions as Array<{ text?: string; fragility?: number }> | undefined) ?? [];
  for (const a of assumptions) {
    if (typeof a.fragility === "number" && a.fragility >= 0.7 && a.text) {
      suggestions.push(`Clarify assumption: ${a.text}`);
      if (suggestions.length >= 2) break;
    }
  }

  // From answered roots with weak signals (no numbers, no fallback)
  const roots = pressureTest?.rootScenarios ?? [];
  for (const root of roots) {
    if (!root.answer) continue;
    const hasNumbers = /\d+/.test(root.answer);
    const hasFallback = /\bfallback\b|\balternative\b|\bif that fails\b|\bpivot\b/i.test(root.answer);
    if (!hasNumbers && !hasFallback) {
      const label = root.failure_vector.charAt(0).toUpperCase() + root.failure_vector.slice(1);
      suggestions.push(`Strengthen fallback for ${label} scenario`);
    }
    if (suggestions.length >= 3) break;
  }

  // From variables needing enrichment
  if (suggestions.length < 4) {
    const variables = (extractionSchema?.variables as Array<{ name?: string; enrichment_needed?: boolean }> | undefined) ?? [];
    for (const v of variables) {
      if (v.enrichment_needed && v.name) {
        suggestions.push(`Add data for: ${v.name}`);
        if (suggestions.length >= 4) break;
      }
    }
  }

  // Fallback: from clarify constraints
  if (suggestions.length === 0) {
    const constraints = clarifyDraft?.constraints ?? [];
    for (const c of constraints.slice(0, 2)) {
      if (c.trim()) suggestions.push(`Constraint worth stress-testing: ${c}`);
    }
  }

  return suggestions.slice(0, 4);
}

function deriveKeyRisks(
  extractionSchema: Record<string, unknown> | null | undefined,
  pressureTest: PressureTestState | null | undefined
): string[] {
  const risks: string[] = [];

  // From extraction risks sorted by severity × probability
  const schemaRisks = (extractionSchema?.risks as Array<{ text?: string; severity?: number; probability?: number }> | undefined) ?? [];
  const sorted = [...schemaRisks]
    .filter((r) => r.text)
    .sort((a, b) => ((b.severity ?? 0) * (b.probability ?? 0)) - ((a.severity ?? 0) * (a.probability ?? 0)));
  for (const r of sorted.slice(0, 3)) {
    if (r.text) risks.push(r.text);
  }

  // From hidden dependencies
  const hiddenDeps = (extractionSchema?.hidden_deps as string[] | undefined) ?? [];
  for (const dep of hiddenDeps.slice(0, 2)) {
    if (risks.length >= 4) break;
    risks.push(dep);
  }

  // From synthesis summary unresolved risks
  if (pressureTest?.synthesized && Array.isArray((pressureTest.summary as Record<string, unknown> | null | undefined)?.unresolved_risks)) {
    const unresolved = ((pressureTest.summary as Record<string, unknown>).unresolved_risks as string[]);
    for (const r of unresolved) {
      if (risks.length >= 4) break;
      if (!risks.includes(r)) risks.push(r);
    }
  }

  // From open root scenarios
  if (pressureTest?.rootScenarios && risks.length < 4) {
    for (const root of pressureTest.rootScenarios) {
      if (root.status !== "closed" && root.answer === null) {
        const label = root.failure_vector.charAt(0).toUpperCase() + root.failure_vector.slice(1);
        const bullet = `No fallback stated for ${label} risk`;
        if (!risks.includes(bullet)) risks.push(bullet);
      }
      if (risks.length >= 4) break;
    }
  }

  return risks.slice(0, 4);
}

function deriveThinkAbout(
  clarifyDraft: ClarifyDraft | null | undefined,
  pressureTest: PressureTestState | null | undefined
): string[] {
  // From root scenarios think_about fields
  const roots = pressureTest?.rootScenarios ?? [];
  if (roots.length > 0) {
    const seen = new Set<string>();
    const items: string[] = [];
    for (const root of roots) {
      for (const phrase of root.think_about) {
        const key = phrase.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          items.push(phrase);
        }
      }
    }
    return items.slice(0, 6);
  }

  // Fallback: from clarify assumptions + constraints
  const items: string[] = [];
  for (const a of clarifyDraft?.assumptions ?? []) {
    if (a.trim()) items.push(a.trim());
    if (items.length >= 3) break;
  }
  for (const c of clarifyDraft?.constraints ?? []) {
    if (c.trim() && items.length < 6) items.push(c.trim());
  }
  return items.slice(0, 6);
}

export function deriveInsights(data: {
  clarifyDraft?: ClarifyDraft | null;
  extractionSchema?: Record<string, unknown> | null;
  pressureTest?: PressureTestState | null;
}): InsightState {
  const { clarifyDraft, extractionSchema, pressureTest } = data;
  return {
    suggestions: deriveSuggestions(clarifyDraft, extractionSchema, pressureTest),
    keyRisks: deriveKeyRisks(extractionSchema, pressureTest),
    thinkAbout: deriveThinkAbout(clarifyDraft, pressureTest),
    thinkingPattern: pressureTest ? deriveThinkingPattern(pressureTest) : [],
  };
}
