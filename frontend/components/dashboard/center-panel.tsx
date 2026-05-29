"use client";

import { ClarifyForm } from "./clarify-form";
import { PressureTest } from "./pressure-test";
import { DecisionOutput } from "./decision-output";
import { DiagnoseFailure } from "./diagnose-failure";
import { SimulationView } from "./simulation-view";
import DecisionCardView from "./decision-card-view";

function EidozLogoLarge({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="60"
        cy="60"
        r="48"
        stroke="url(#logoGradientLarge)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="260 40"
        transform="rotate(-90 60 60)"
      />
      <defs>
        <linearGradient
          id="logoGradientLarge"
          x1="60"
          y1="12"
          x2="60"
          y2="108"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#c9b896" />
          <stop offset="1" stopColor="#8a8279" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface CenterPanelProps {
  view: "home" | "clarify" | "pressure-test" | "decision-output" | "simulation" | "failure-analysis" | "decision-card";
  selectedThreadId?: string | null;
  onStartDecision: () => void;
  onBack: () => void;
  onContinue: (data: any) => void;
  onAutosaveClarify?: (data: any) => Promise<void> | void;
  autosaveStatus?: "idle" | "saving" | "saved" | "error";
  onSubmitFinal: () => void;
  onRunSimulation?: () => void;
  onStartRevision?: () => void;
  onViewDecisionCard?: () => void;
  onRebuildDecision?: (context?: { failedTitle: string; failedLessons: string[] }) => void;
  decisionData?: any;
  selectedFailedDecision?: string | null;
  onPressureStateChange?: (state: any) => void;
  reentryContext?: { failedTitle: string; failedLessons: string[] } | null;
  onFailureAnalysisComplete?: (data: { likelyRootCause: string; cognitiveBias: string; missedVariable: string; recommendation: string; }) => void;
  onPressureAnswerChange?: (text: string) => void;
  onFailureRawInputChange?: (text: string) => void;
}

export function CenterPanel({ view, selectedThreadId, onStartDecision, onBack, onContinue, onAutosaveClarify, autosaveStatus, onSubmitFinal, onRunSimulation, onStartRevision, onViewDecisionCard, onRebuildDecision, decisionData, selectedFailedDecision, onPressureStateChange, reentryContext, onFailureAnalysisComplete, onPressureAnswerChange, onFailureRawInputChange }: CenterPanelProps) {
  if (view === "clarify") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <ClarifyForm
          threadId={selectedThreadId}
          onBack={onBack}
          onContinue={onContinue}
          onAutosave={onAutosaveClarify}
          autosaveStatus={autosaveStatus}
          initialData={decisionData}
          reentryContext={reentryContext}
        />
      </main>
    );
  }

  if (view === "pressure-test") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <PressureTest threadId={selectedThreadId} onBack={onBack} onSubmitFinal={onSubmitFinal} onStateChange={onPressureStateChange} onAnswerChange={onPressureAnswerChange} />
      </main>
    );
  }

  if (view === "decision-output") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <DecisionOutput
          threadId={selectedThreadId}
          onBack={onBack}
          onRunSimulation={onRunSimulation || (() => {})}
          onStartRevision={onStartRevision || (() => {})}
          onViewDecisionCard={onViewDecisionCard || (() => {})}
        />
      </main>
    );
  }

  if (view === "decision-card") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <DecisionCardView
          threadId={selectedThreadId!}
          onBack={onBack}
          onFailureAnalysis={() => {}}
        />
      </main>
    );
  }

  if (view === "simulation") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <SimulationView threadId={selectedThreadId} onBack={onBack} />
      </main>
    );
  }

  if (view === "failure-analysis") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <DiagnoseFailure
          threadId={selectedThreadId}
          failedDecision={selectedFailedDecision || "Unknown Decision"}
          onBack={onBack}
          onRebuild={onRebuildDecision || ((_ctx) => {})}
          onAnalysisComplete={onFailureAnalysisComplete}
          onRawInputChange={onFailureRawInputChange}
        />
      </main>
    );
  }

  return (
    <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-8">
        {/* Logo */}
        <EidozLogoLarge className="w-28 h-28" />

        {/* Title */}
        <h1 className="text-4xl tracking-[0.4em] text-foreground font-serif font-light">
          EIDOZ
        </h1>

        {/* Tagline */}
        <p className="text-lg text-foreground/80 font-serif italic">
          Think Clearly. Decide Better.
        </p>

        {/* CTA Button */}
        <button
          id="tour-start-btn"
          onClick={onStartDecision}
          className="mt-4 px-8 py-3 bg-[#d4bf96] text-[#1a1816] rounded-full text-base font-semibold hover:bg-[#deca9f] transition-colors shadow-lg shadow-[#c9b896]/40"
        >
          Start New Decision
        </button>
      </div>
    </main>
  );
}
