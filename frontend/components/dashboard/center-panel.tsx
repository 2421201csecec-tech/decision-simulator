"use client";

import { ClarifyForm } from "./clarify-form";
import { PressureTest } from "./pressure-test";
import { DecisionOutput } from "./decision-output";
import { DiagnoseFailure } from "./diagnose-failure";

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
  view: "home" | "clarify" | "pressure-test" | "decision-output" | "failure-analysis";
  selectedThreadId?: string | null;
  onStartDecision: () => void;
  onBack: () => void;
  onContinue: (data: any) => void;
  onAutosaveClarify?: (data: any) => Promise<void> | void;
  onDraftChange?: (data: any) => void;
  autosaveStatus?: "idle" | "saving" | "saved" | "error";
  onSubmitFinal: () => void;
  onRunSimulation?: () => void;
  onStartRevision?: () => void;
  onRebuildDecision?: () => void;
  decisionData?: any;
  selectedFailedDecision?: string | null;
}

export function CenterPanel({ view, selectedThreadId, onStartDecision, onBack, onContinue, onAutosaveClarify, onDraftChange, autosaveStatus, onSubmitFinal, onRunSimulation, onStartRevision, onRebuildDecision, decisionData, selectedFailedDecision }: CenterPanelProps) {
  if (view === "clarify") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <ClarifyForm
          onBack={onBack}
          onContinue={onContinue}
          onAutosave={onAutosaveClarify}
          onDraftChange={onDraftChange}
          autosaveStatus={autosaveStatus}
          initialData={decisionData}
        />
      </main>
    );
  }

  if (view === "pressure-test") {
    return (
      <main className="flex-1 h-full bg-card rounded-2xl border border-border/50 overflow-hidden">
        <PressureTest threadId={selectedThreadId} onBack={onBack} onSubmitFinal={onSubmitFinal} />
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
        />
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
          onRebuild={onRebuildDecision || (() => {})} 
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
          onClick={onStartDecision}
          className="mt-4 px-8 py-3 bg-accent text-accent-foreground rounded-full text-base font-medium hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
        >
          Start New Decision
        </button>
      </div>
    </main>
  );
}
