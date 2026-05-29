"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, RotateCcw, ArrowRight, Lightbulb, Zap } from "lucide-react";
import {
  fetchPressureTest,
  generatePressureTest,
  skipPressureTestScenario,
  submitPressureAnswer,
  type PressureTestState,
  type RootScenario,
  type RootProbe,
} from "@/lib/api/threads";

interface PressureTestProps {
  threadId?: string | null;
  onBack: () => void;
  onSubmitFinal: () => void;
  onStateChange?: (state: PressureTestState | null) => void;
  onAnswerChange?: (text: string) => void;
}

const VECTOR_LABELS: Record<string, string> = {
  execution: "Execution Risk",
  financial: "Financial Risk",
  external: "External Risk",
};

const VECTOR_COLORS: Record<string, string> = {
  execution: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  financial: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  external: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export function PressureTest({ threadId, onBack, onSubmitFinal, onStateChange, onAnswerChange }: PressureTestProps) {
  const [pressureState, setPressureState] = useState<PressureTestState | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v2 derived values
  const isV2 = Boolean(pressureState?.rootScenarios);

  const activeRoot = useMemo<RootScenario | null>(() => {
    if (!isV2 || !pressureState?.rootScenarios) return null;
    return (
      pressureState.rootScenarios.find((r) => r.status === "open" || r.status === "probing") ?? null
    );
  }, [isV2, pressureState]);

  const activeProbe = useMemo<RootProbe | null>(() => {
    if (!activeRoot) return null;
    return activeRoot.probes.find((p) => p.status === "open") ?? null;
  }, [activeRoot]);

  // v1 derived values
  const v1Scenario = useMemo(() => {
    if (isV2 || !pressureState) return null;
    return pressureState.scenarios[pressureState.currentIndex] ?? null;
  }, [isV2, pressureState]);

  const totalScenarios = pressureState?.scenarios?.length ?? 0;
  const currentScenarioIdx = pressureState?.currentIndex ?? 0;
  const v1Progress = totalScenarios > 0 ? ((currentScenarioIdx + 1) / totalScenarios) * 100 : 0;

  const v2ClosedCount = useMemo(() => {
    if (!pressureState?.rootScenarios) return 0;
    return pressureState.rootScenarios.filter((r) => r.status === "closed").length;
  }, [pressureState]);
  const v2Progress = (v2ClosedCount / 3) * 100;

  const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
  const wordCount = countWords(answer);
  const maxWords = 120;

  const handleAnswerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (countWords(text) <= maxWords) {
      setAnswer(text);
      onAnswerChange?.(text);
    }
  };

  useEffect(() => {
    if (!threadId) {
      setError("Please create or select a thread first.");
      setLoading(false);
      return;
    }

    let active = true;

    const loadPressureState = async () => {
      try {
        setLoading(true);
        setError(null);
        const existing = await fetchPressureTest(threadId);
        const state = existing ?? (await generatePressureTest(threadId));

        if (!active) return;

        if (!state) {
          setError("Your input doesn't have enough detail to generate pressure-test scenarios. Please go back and fill in the decision title, core problem, and context more clearly.");
          return;
        }

        setPressureState(state);
        onStateChange?.(state);

        if (state.rootScenarios) {
          setAnswer("");
        } else {
          const current = state.scenarios[state.currentIndex];
          setAnswer(current ? state.responses[String(current.id)]?.answer ?? "" : "");
        }

        if (state.completed) onSubmitFinal();
      } catch {
        if (!active) return;
        setError("Unable to load pressure-test scenarios.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPressureState();
    return () => { active = false; };
  }, [threadId, onSubmitFinal]);

  // --- v2 handlers ---
  const handleSubmitV2 = async () => {
    if (!threadId || !activeRoot || !answer.trim() || submitting) return;
    try {
      setSubmitting(true);
      const next = await submitPressureAnswer(threadId, {
        scenarioId: activeRoot.id,
        answer,
        probeId: activeProbe?.id ?? null,
      });
      setPressureState(next);
      onStateChange?.(next);
      setAnswer("");
      if (next.completed) onSubmitFinal();
    } catch {
      setError("Failed to submit answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipV2 = async () => {
    if (!threadId || !activeRoot || submitting) return;
    try {
      setSubmitting(true);
      const next = await skipPressureTestScenario(threadId, {
        scenarioId: activeRoot.id,
        probeId: activeProbe?.id ?? null,
      });
      setPressureState(next);
      onStateChange?.(next);
      setAnswer("");
      if (next.completed) onSubmitFinal();
    } catch {
      setError("Failed to skip scenario. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- v1 handlers ---
  const handleSubmitV1 = async () => {
    if (!threadId || !v1Scenario || !answer.trim() || submitting) return;
    try {
      setSubmitting(true);
      const next = await submitPressureAnswer(threadId, { scenarioId: v1Scenario.id, answer });
      setPressureState(next);
      if (next.completed) { onSubmitFinal(); return; }
      const nextScenario = next.scenarios[next.currentIndex];
      setAnswer(nextScenario ? next.responses[String(nextScenario.id)]?.answer ?? "" : "");
    } catch {
      setError("Failed to submit answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipV1 = async () => {
    if (!threadId || !v1Scenario || submitting) return;
    try {
      setSubmitting(true);
      const next = await skipPressureTestScenario(threadId, { scenarioId: v1Scenario.id });
      setPressureState(next);
      if (next.completed) { onSubmitFinal(); return; }
      const nextScenario = next.scenarios[next.currentIndex];
      setAnswer(nextScenario ? next.responses[String(nextScenario.id)]?.answer ?? "" : "");
    } catch {
      setError("Failed to skip scenario. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Loading / empty states ---
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading pressure-test scenarios...
      </div>
    );
  }

  if (error || (!isV2 && !v1Scenario) || (isV2 && !activeRoot)) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(220,80,60,0.12)', border: '1px solid rgba(220,80,60,0.3)' }}>
          <span style={{ color: 'rgba(220,80,60,0.8)', fontSize: 18 }}>!</span>
        </div>
        <p className="text-sm font-medium text-foreground/80">
          {error ?? "No pressure-test scenarios available."}
        </p>
        <button
          onClick={onBack}
          className="text-xs px-4 py-2 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Go back and add more detail
        </button>
      </div>
    );
  }

  // ─── v2 render ────────────────────────────────────────────────────────────
  if (isV2 && activeRoot) {
    const thinkAbout = activeProbe ? [] : activeRoot.think_about;
    const displayQuestion = activeProbe ? activeProbe.question : activeRoot.question;
    const vectorColor = VECTOR_COLORS[activeRoot.failure_vector] ?? VECTOR_COLORS.external;
    const vectorLabel = VECTOR_LABELS[activeRoot.failure_vector] ?? activeRoot.failure_vector;

    return (
      <div className="h-full flex flex-col p-6 overflow-y-auto scroll-container">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-serif text-foreground">Pressure Test</h2>
          </div>
          <div className="flex items-center gap-2">
            {pressureState?.enriched && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-accent/10 text-accent border border-accent/20 rounded-full">
                <Zap className="w-3 h-3" />
                Enriched
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {v2ClosedCount} / 3 scenarios
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out rounded-full"
              style={{ width: `${v2Progress}%` }}
            />
          </div>
        </div>

        <div className="flex-1 max-w-2xl mx-auto w-full">
          {/* Vector Badge */}
          <div className="mb-6 flex items-center gap-2">
            <span className={`inline-block px-3 py-1 text-xs rounded-full border font-medium ${vectorColor}`}>
              {vectorLabel}
            </span>
            {activeProbe && (
              <span className="inline-block px-3 py-1 text-xs rounded-full border bg-secondary/50 text-muted-foreground border-border/40">
                Follow-up
              </span>
            )}
          </div>

          {/* Scenario card */}
          <div
            className="mb-4 rounded-xl p-6 mx-[-2rem]"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(201,184,150,0.35)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <p className="text-xl font-serif text-foreground leading-relaxed">
              {activeRoot.scenario}
            </p>
          </div>

          {/* Question */}
          {!activeProbe ? (
            <div className="flex gap-3 mb-6">
              <div className="w-0.5 rounded-full shrink-0" style={{ background: 'rgba(201,184,150,0.6)' }} />
              <p className="text-base text-foreground/70 leading-relaxed">{activeRoot.question}</p>
            </div>
          ) : (
            <div className="mb-6 pl-4 border-l-2 border-accent/40">
              <p className="text-base text-foreground/90 leading-relaxed">{displayQuestion}</p>
            </div>
          )}

          {/* Answer Field */}
          <div className="space-y-2 mb-6">
            <textarea
              value={answer}
              onChange={handleAnswerChange}
              placeholder="Write your answer here... (Max 120 words)"
              rows={6}
              className="w-full bg-secondary/50 border border-border/50 rounded-lg px-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/50 resize-none transition-all"
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">{wordCount} / {maxWords}</span>
            </div>
          </div>

          {/* Think About Chips (root question only) */}
          {thinkAbout.length > 0 && (
            <div className="flex items-center gap-3 mb-8 flex-wrap">
              <div className="flex items-center gap-2 text-accent">
                <Lightbulb className="w-4 h-4" />
                <span className="text-sm">Think about:</span>
              </div>
              {thinkAbout.map((item, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 bg-secondary border border-border/50 rounded-full text-sm text-foreground/80"
                >
                  {item}
                </span>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 pb-6">
            <button
              onClick={handleSkipV2}
              disabled={submitting}
              className="px-5 py-2.5 bg-secondary border border-border/50 text-foreground/80 rounded-full text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {activeProbe ? "Skip Follow-up" : "Skip Scenario"}
            </button>
            <button
              onClick={handleSubmitV2}
              disabled={!answer.trim() || submitting}
              className="px-6 py-2.5 bg-accent text-accent-foreground rounded-full text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit Answer
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {error && <p className="text-xs text-destructive pb-2">{error}</p>}
        </div>
      </div>
    );
  }

  // ─── v1 render (unchanged) ─────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto scroll-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-serif text-foreground">Pressure Test</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Scenario {currentScenarioIdx + 1} of {totalScenarios}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div id="tour-pt-progress" className="mb-8">
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300 ease-out rounded-full"
            style={{ width: `${v1Progress}%` }}
          />
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <span className="inline-block px-4 py-1.5 bg-accent/20 text-accent text-sm rounded-full border border-accent/30">
            Scenario {currentScenarioIdx + 1}
          </span>
        </div>

        <div
          id="tour-pt-scenario"
          className="mb-4 rounded-xl p-6 mx-[-2rem]"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(201,184,150,0.35)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <p className="text-xl font-serif text-foreground leading-relaxed">
            {v1Scenario!.scenario.split("Rs ").map((part, i) =>
              i === 0 ? part : (
                <span key={i}>
                  <span className="text-accent">Rs {part.split(/\s/)[0]}</span>
                  {part.substring(part.indexOf(" "))}
                </span>
              )
            )}
          </p>
        </div>
        <div className="flex gap-3 mb-8">
          <div className="w-0.5 rounded-full shrink-0" style={{ background: 'rgba(201,184,150,0.6)' }} />
          <p className="text-base text-foreground/70 leading-relaxed">{v1Scenario!.question}</p>
        </div>

        <div id="tour-pt-answer" className="space-y-2 mb-6">
          <textarea
            value={answer}
            onChange={handleAnswerChange}
            placeholder="Write your answer here... (Max 120 words)"
            rows={6}
            className="w-full bg-secondary/50 border border-border/50 rounded-lg px-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/50 resize-none transition-all"
          />
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">{wordCount} / {maxWords}</span>
          </div>
        </div>

        <div id="tour-pt-hints" className="flex items-center gap-3 mb-8 flex-wrap">
          <div className="flex items-center gap-2 text-accent">
            <Lightbulb className="w-4 h-4" />
            <span className="text-sm">Think about:</span>
          </div>
          {v1Scenario!.thinkAbout.map((item, i) => (
            <span
              key={i}
              className="px-3 py-1.5 bg-secondary border border-border/50 rounded-full text-sm text-foreground/80"
            >
              {item}
            </span>
          ))}
        </div>

        <div id="tour-pt-actions" className="flex items-center justify-between pt-4 pb-6">
          <button
            onClick={handleSkipV1}
            disabled={submitting}
            className="px-5 py-2.5 bg-secondary border border-border/50 text-foreground/80 rounded-full text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Skip Scenario
          </button>
          <button
            onClick={handleSubmitV1}
            disabled={!answer.trim() || submitting}
            className="px-6 py-2.5 bg-accent text-accent-foreground rounded-full text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Answer
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-xs text-destructive pb-2">{error}</p>}
      </div>
    </div>
  );
}
