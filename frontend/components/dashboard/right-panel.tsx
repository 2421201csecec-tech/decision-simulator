"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, ChevronRight, ChevronLeft, AlertTriangle, Settings, ListX, Lightbulb, Zap, TrendingUp, AlertCircle, Beaker } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  fetchDecisionOutput,
  fetchFailureAnalysis,
  type DecisionOutputData,
  type DraftInsights,
  type FailureAnalysisData,
} from "@/lib/api/threads";

interface RightPanelProps {
  view: "home" | "clarify" | "pressure-test" | "decision-output" | "simulation" | "failure-analysis";
  threadId?: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRunSimulation?: () => void;
  onStartRevision?: () => void;
  clarifyInsights?: DraftInsights | null;
  isAnalyzingDraft?: boolean;
}

// Pressure test insights
const weakAssumptions = [
  { text: "You assume users will accept premium pricing." },
];

const possibleBias = [
  { text: "Overconfidence bias detected." },
];

const missingVariables = [
  { text: "Competitor pricing" },
  { text: "Customer sensitivity" },
  { text: "Acquisition cost" },
];

const pressureSuggestion = "Consider testing a ₹1999 launch price.";
const decisionStrength = 42;

// Decision output fallback insights
const outputStrengths = [
  { text: "Decision output will appear once synthesis is available." },
];

const outputWeakPoints = [
  { text: "No weak point data available yet." },
];

const outputSuggestedExperiment = "Run simulation to generate a suggested experiment.";

// Failure analysis insights
const likelyRootCause = [
  { text: "Overestimated willingness to pay" },
];

const cognitiveBias = [
  { text: "Overconfidence bias detected" },
];

const missedVariable = [
  { text: "Competitor pricing dynamics" },
];

const failureRecommendation = "Test pricing ladder: ₹1499 / ₹1999 / ₹2499";

function DecisionStrengthMeter({ value }: { value: number }) {
  const radius = 36;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / 100) * circumference;
  const getLabel = (v: number) => {
    if (v < 30) return "Weak";
    if (v < 60) return "Moderate";
    if (v < 80) return "Strong";
    return "Very Strong";
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 88 88">
          {/* Background circle */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-secondary"
          />
          {/* Progress circle */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className="text-accent transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-medium text-foreground">{value}%</span>
        </div>
      </div>
      <span className="text-accent font-medium">{getLabel(value)}</span>
    </div>
  );
}

export function RightPanel({ view, threadId, isCollapsed, onToggleCollapse, clarifyInsights, isAnalyzingDraft }: RightPanelProps) {
  const [decisionOutputData, setDecisionOutputData] = useState<DecisionOutputData | null>(null);
  const [failureAnalysisData, setFailureAnalysisData] = useState<FailureAnalysisData | null>(null);

  useEffect(() => {
    if (view !== "decision-output" || !threadId) {
      return;
    }

    let active = true;

    const loadDecisionOutput = async () => {
      try {
        const output = await fetchDecisionOutput(threadId);
        if (!active) return;
        setDecisionOutputData(output);
      } catch {
        if (!active) return;
        setDecisionOutputData(null);
      }
    };

    loadDecisionOutput();

    return () => {
      active = false;
    };
  }, [view, threadId]);

  useEffect(() => {
    if (view !== "failure-analysis" || !threadId) {
      return;
    }

    let active = true;

    const loadFailureAnalysis = async () => {
      try {
        const data = await fetchFailureAnalysis(threadId);
        if (!active) return;
        setFailureAnalysisData(data);
      } catch {
        if (!active) return;
        setFailureAnalysisData(null);
      }
    };

    loadFailureAnalysis();

    return () => {
      active = false;
    };
  }, [view, threadId]);

  if (isCollapsed) {
    return (
      <aside className="w-10 h-full flex flex-col items-center pt-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-card"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-72 h-full bg-card rounded-2xl border border-border/50 p-5 relative flex flex-col">
      {/* Header with collapse and menu */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onToggleCollapse}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {(view === "clarify" || view === "pressure-test") && (
          <h3 className="text-sm font-medium text-foreground flex-1 text-center">
            AI Thinking Assistant
          </h3>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/50">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-40 bg-card border-border"
          >
            <DropdownMenuItem className="cursor-pointer text-foreground hover:bg-secondary focus:bg-secondary">
              View Insights
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-foreground hover:bg-secondary focus:bg-secondary">
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pressure Test View */}
      {view === "pressure-test" && (
        <div className="flex-1 space-y-5 overflow-y-auto scroll-container">
          {/* Weak Assumptions */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Weak Assumptions</h4>
            </div>
            <p className="text-sm text-foreground/80">{weakAssumptions[0].text}</p>
          </div>

          {/* Possible Bias */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Possible Bias</h4>
            </div>
            <p className="text-sm text-foreground/80">{possibleBias[0].text}</p>
          </div>

          {/* Missing Variables */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <h4 className="text-sm font-medium text-accent mb-3">Missing Variables</h4>
            <ul className="space-y-2">
              {missingVariables.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggestion */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Suggestion</h4>
            </div>
            <p className="text-sm text-foreground/80">
              Consider testing a <span className="text-accent">₹1999</span> launch price.
            </p>
          </div>

          {/* Generate Harder Scenario Button */}
          <button className="w-full p-3 bg-secondary border border-border/50 rounded-xl text-sm text-foreground/80 hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            Generate Harder Scenario
          </button>

          {/* Decision Strength */}
          <div className="pt-2">
            <h4 className="text-sm text-muted-foreground mb-3">Decision Strength</h4>
            <DecisionStrengthMeter value={decisionStrength} />
          </div>
        </div>
      )}

      {/* Clarify View */}
      {view === "clarify" && (
        <div className="flex-1 space-y-6 overflow-y-auto scroll-container">
          {isAnalyzingDraft ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="animate-pulse">Analysing</span>
              <span className="animate-pulse delay-75">.</span>
              <span className="animate-pulse delay-150">.</span>
              <span className="animate-pulse delay-300">.</span>
            </div>
          ) : !clarifyInsights ? (
            <p className="text-sm text-muted-foreground">Keep writing to get insights...</p>
          ) : (
            <>
              {/* Suggestions */}
              {clarifyInsights.suggestions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Suggestions</h4>
                  <ul className="space-y-2">
                    {clarifyInsights.suggestions.map((text, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Missing Elements */}
              {clarifyInsights.missing_elements.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Missing Elements</h4>
                  <ul className="space-y-2">
                    {clarifyInsights.missing_elements.map((text, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bias Watch */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Bias Watch</h4>
                {clarifyInsights.biases.length > 0 ? (
                  <ul className="space-y-2">
                    {clarifyInsights.biases.map((text, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No major bias detected.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Home View - Empty */}
      {view === "home" && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground/50 text-sm text-center">
            {/* AI insights will appear here */}
          </p>
        </div>
      )}

      {/* Decision Output View */}
      {view === "decision-output" && (
        <div className="flex-1 space-y-5 overflow-y-auto scroll-container">
          {/* Strengths */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Strengths</h4>
            </div>
            <ul className="space-y-2">
              {(decisionOutputData?.strengths?.length
                ? decisionOutputData.strengths.map((text) => ({ text }))
                : outputStrengths
              ).map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Weak Points */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Weak Points</h4>
            </div>
            <ul className="space-y-2">
              {(decisionOutputData?.weakPoints?.length
                ? decisionOutputData.weakPoints.map((text) => ({ text }))
                : outputWeakPoints
              ).map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggested Experiment */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Beaker className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Suggested Experiment</h4>
            </div>
            <p className="text-sm text-foreground/80">
              {decisionOutputData?.suggestedExperiment || outputSuggestedExperiment}
            </p>
          </div>
        </div>
      )}

      {/* Failure Analysis View */}
      {view === "failure-analysis" && (
        <div className="flex-1 space-y-5 overflow-y-auto scroll-container">
          {/* Likely Root Cause */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Likely Root Cause</h4>
            </div>
            <ul className="space-y-2">
              {(failureAnalysisData?.likelyRootCause
                ? [{ text: failureAnalysisData.likelyRootCause }]
                : likelyRootCause
              ).map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Cognitive Bias */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Cognitive Bias</h4>
            </div>
            <ul className="space-y-2">
              {(failureAnalysisData?.cognitiveBias
                ? [{ text: failureAnalysisData.cognitiveBias }]
                : cognitiveBias
              ).map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Missed Variable */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <ListX className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Missed Variable</h4>
            </div>
            <ul className="space-y-2">
              {(failureAnalysisData?.missedVariable
                ? [{ text: failureAnalysisData.missedVariable }]
                : missedVariable
              ).map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendation */}
          <div className="p-4 bg-accent/10 rounded-xl border border-accent/30">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-accent" />
              <h4 className="text-sm font-medium text-accent">Recommendation</h4>
            </div>
            <p className="text-sm text-foreground/80">
              {failureAnalysisData?.recommendation || failureRecommendation}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
