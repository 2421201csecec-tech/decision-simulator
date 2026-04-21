"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, RotateCcw, ArrowRight, Lightbulb } from "lucide-react";
import {
  fetchPressureTest,
  generatePressureTest,
  skipPressureTestScenario,
  submitPressureAnswer,
  type PressureTestState,
} from "@/lib/api/threads";

interface PressureTestProps {
  threadId?: string | null;
  onBack: () => void;
  onSubmitFinal: () => void;
}

export function PressureTest({ threadId, onBack, onSubmitFinal }: PressureTestProps) {
  const [pressureState, setPressureState] = useState<PressureTestState | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenario = useMemo(() => {
    if (!pressureState) return null;
    return pressureState.scenarios[pressureState.currentIndex] ?? null;
  }, [pressureState]);

  const totalScenarios = pressureState?.scenarios.length ?? 0;
  const currentScenario = pressureState?.currentIndex ?? 0;
  const progress = totalScenarios > 0 ? ((currentScenario + 1) / totalScenarios) * 100 : 0;

  const countWords = (text: string) => {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  };

  const wordCount = countWords(answer);
  const maxWords = 120;

  const handleAnswerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const words = countWords(text);
    if (words <= maxWords) {
      setAnswer(text);
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

        setPressureState(state);
        const current = state.scenarios[state.currentIndex];
        const existingAnswer = current ? state.responses[String(current.id)]?.answer ?? "" : "";
        setAnswer(existingAnswer);

        if (state.completed) {
          onSubmitFinal();
        }
      } catch {
        if (!active) return;
        setError("Unable to load pressure-test scenarios.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPressureState();

    return () => {
      active = false;
    };
  }, [threadId, onSubmitFinal]);

  const handleSubmit = async () => {
    if (!threadId || !scenario || !answer.trim() || submitting) return;

    try {
      setSubmitting(true);
      const next = await submitPressureAnswer(threadId, {
        scenarioId: scenario.id,
        answer,
      });
      setPressureState(next);

      if (next.completed) {
        onSubmitFinal();
        return;
      }

      const nextScenario = next.scenarios[next.currentIndex];
      setAnswer(nextScenario ? next.responses[String(nextScenario.id)]?.answer ?? "" : "");
    } catch {
      setError("Failed to submit answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!threadId || !scenario || submitting) return;

    try {
      setSubmitting(true);
      const next = await skipPressureTestScenario(threadId, {
        scenarioId: scenario.id,
      });
      setPressureState(next);

      if (next.completed) {
        onSubmitFinal();
        return;
      }

      const nextScenario = next.scenarios[next.currentIndex];
      setAnswer(nextScenario ? next.responses[String(nextScenario.id)]?.answer ?? "" : "");
    } catch {
      setError("Failed to skip scenario. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading pressure-test scenarios...
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        {error ?? "No pressure-test scenarios available."}
      </div>
    );
  }

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
            Scenario {currentScenario + 1} of {totalScenarios}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Scenario Card */}
      <div className="flex-1 max-w-2xl mx-auto w-full">
        {/* Scenario Badge */}
        <div className="mb-6">
          <span className="inline-block px-4 py-1.5 bg-accent/20 text-accent text-sm rounded-full border border-accent/30">
            Scenario {currentScenario + 1}
          </span>
        </div>

        {/* Scenario Text */}
        <div className="mb-8">
          <p className="text-2xl font-serif text-foreground mb-2">
            {scenario.scenario.split("Rs ").map((part, i) =>
              i === 0 ? (
                part
              ) : (
                <span key={i}>
                  <span className="text-accent">Rs {part.split(/\s/)[0]}</span>
                  {part.substring(part.indexOf(" "))}
                </span>
              )
            )}
          </p>
          <p className="text-lg text-foreground/80">{scenario.question}</p>
        </div>

        {/* Answer Field */}
        <div className="space-y-2 mb-6">
          <div className="relative">
            <textarea
              value={answer}
              onChange={handleAnswerChange}
              placeholder="Write your answer here... (Max 120 words)"
              rows={6}
              className="w-full bg-secondary/50 border border-border/50 rounded-lg px-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/50 resize-none transition-all"
            />
          </div>
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">
              {wordCount} / {maxWords}
            </span>
          </div>
        </div>

        {/* Think About Chips */}
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <div className="flex items-center gap-2 text-accent">
            <Lightbulb className="w-4 h-4" />
            <span className="text-sm">Think about:</span>
          </div>
          {scenario.thinkAbout.map((item, index) => (
            <span
              key={index}
              className="px-3 py-1.5 bg-secondary border border-border/50 rounded-full text-sm text-foreground/80"
            >
              {item}
            </span>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 pb-6">
          <button
            onClick={handleSkip}
            disabled={submitting}
            className="px-5 py-2.5 bg-secondary border border-border/50 text-foreground/80 rounded-full text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Skip Scenario
          </button>

          <button
            onClick={handleSubmit}
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
