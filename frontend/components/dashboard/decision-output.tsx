"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, TrendingUp, AlertTriangle, FlaskConical, Lock, RotateCcw, CheckCircle2, ShieldAlert } from "lucide-react";
import { fetchDecisionOutput, type DecisionOutputData } from "@/lib/api/threads";

interface DecisionOutputProps {
  threadId?: string | null;
  onBack: () => void;
  onRunSimulation: () => void;
  onStartRevision: () => void;
}

const STRENGTH_ZONES = [
  { label: "Tentative",  min: 0,  max: 39,  active: "bg-red-500/20 text-red-400 border-red-500/50 ring-1 ring-red-500/30",       inactive: "bg-secondary/50 text-foreground/50 border-border/50" },
  { label: "Developing", min: 40, max: 59,  active: "bg-amber-500/20 text-amber-400 border-amber-500/50 ring-1 ring-amber-500/30", inactive: "bg-secondary/50 text-foreground/50 border-border/50" },
  { label: "Moderate",   min: 60, max: 79,  active: "bg-accent/20 text-accent border-accent/50 ring-1 ring-accent/30",             inactive: "bg-secondary/50 text-foreground/50 border-border/50" },
  { label: "Confident",  min: 80, max: 100, active: "bg-green-500/20 text-green-400 border-green-500/50 ring-1 ring-green-500/30", inactive: "bg-secondary/50 text-foreground/50 border-border/50" },
];

function StrengthSpectrum({ value }: { value: number }) {
  const actualIndex = STRENGTH_ZONES.findIndex((z) => value >= z.min && value <= z.max);
  const [activeIndex, setActiveIndex] = useState(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setSettled(false);
    let step = 0;
    const totalSteps = 9;
    const interval = setInterval(() => {
      step++;
      if (step >= totalSteps) {
        clearInterval(interval);
        setActiveIndex(actualIndex);
        setSettled(true);
      } else {
        setActiveIndex(step % STRENGTH_ZONES.length);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [actualIndex]);

  return (
    <div className="flex items-center gap-2">
      {STRENGTH_ZONES.map((zone, i) => {
        const isActive = i === activeIndex;
        return (
          <span
            key={zone.label}
            className={`px-3.5 py-1 rounded-full border text-sm font-medium transition-all duration-200 ${
              isActive ? zone.active : zone.inactive
            } ${isActive && !settled ? "scale-105" : ""}`}
          >
            {zone.label}
            {isActive && settled && <span className="ml-1.5 opacity-70">· {value}%</span>}
          </span>
        );
      })}
    </div>
  );
}

export function DecisionOutput({ threadId, onBack, onRunSimulation, onStartRevision }: DecisionOutputProps) {
  const [output, setOutput] = useState<DecisionOutputData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) {
      setOutput(null);
      setLoading(false);
      setError("Select a thread to load decision output.");
      return;
    }

    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchDecisionOutput(threadId);
        if (!active) return;
        setOutput(data);
      } catch {
        if (!active) return;
        setError("Unable to load decision output.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [threadId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading decision output...
      </div>
    );
  }

  if (!output) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        {error ?? "Decision output unavailable."}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/30 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="w-px h-4 bg-border/50" />
        <h2 className="text-base font-medium text-foreground">Decision Output</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

        {/* Decision title + strength pills */}
        <div className="space-y-2">
          <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Decision Title</p>
          <h3 className="text-2xl text-foreground leading-snug" style={{ fontFamily: 'var(--font-playfair)' }}>{output.decisionTitle}</h3>
        </div>

        {/* Hero card — Verdict + Reasons + Strength */}
        <div className="mt-6" />
        <div className="rounded-2xl bg-secondary/30 px-6 py-5 space-y-3">

            {/* Verdict */}
            <div className="space-y-5">
              {/* Ticket-style header */}
              <div
                className="relative w-fit mx-auto px-8 py-1.5"
                style={{
                  borderTop: "1px solid rgba(201,184,150,0.40)",
                  borderBottom: "1px solid rgba(201,184,150,0.40)",
                }}
              >
                <p className="text-sm font-bold tracking-widest text-accent uppercase">Final Verdict</p>
              </div>
              <p className="text-base leading-relaxed px-4 py-3 rounded-sm bg-accent/[0.04] backdrop-blur-sm text-foreground shadow-[0_0_16px_rgba(201,184,150,0.08)]">{output.finalDecision}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-border/20" />

            {/* Key Reasons */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <p className="text-sm font-semibold tracking-wide text-green-400 uppercase">Key Reasons</p>
              </div>
              <ul className="space-y-2">
                {output.keyReasons.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-base text-foreground/80">
                    <div className="w-0.5 rounded-full bg-green-500/50 shrink-0 self-stretch mt-1" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Divider */}
            <div className="border-t border-border/20" />

            {/* Strength */}
            <StrengthSpectrum value={output.decisionStrength} />

          </div>

        {/* Strengths + Weak Points — side by side */}
        <div className="grid grid-cols-2 gap-4 mt-8">
          {output.strengths?.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent shrink-0" />
                <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Strengths</p>
              </div>
              <ul className="space-y-2.5">
                {output.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-base text-foreground/80">
                    <div className="w-0.5 rounded-full bg-accent/40 shrink-0 self-stretch mt-1" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {output.weakPoints?.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Weak Points</p>
              </div>
              <ul className="space-y-2.5">
                {output.weakPoints.map((w, i) => (
                  <li key={i} className="flex gap-2.5 text-base text-foreground/80">
                    <div className="w-0.5 rounded-full bg-amber-500/40 shrink-0 self-stretch mt-1" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Key Risks + Assumptions — side by side */}
        <div className="grid grid-cols-2 gap-4 mt-8">
          <div className="rounded-xl bg-red-500/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm font-bold tracking-widest text-red-400 uppercase">Key Risks</p>
            </div>
            <ul className="space-y-2.5">
                {output.keyRisks.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-base text-foreground/80">
                    <div className="w-0.5 rounded-full bg-red-500/50 shrink-0 self-stretch mt-1" />
                    <span>{r}</span>
                  </li>
                ))}
            </ul>
          </div>
          {output.assumptions?.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-secondary/20 p-4 space-y-3">
              <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Assumptions that must hold</p>
              <ul className="space-y-2.5">
                {output.assumptions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-base text-foreground/80">
                    <div className="w-0.5 rounded-full bg-accent/60 shrink-0 self-stretch mt-1" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Suggested Experiment */}
        {output.suggestedExperiment && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-accent shrink-0" />
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">Your Next Experiment</p>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{output.suggestedExperiment}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onRunSimulation}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border/50 text-foreground/80 rounded-xl text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <Lock className="w-4 h-4" />
            Run Simulation
          </button>
          <button
            onClick={onStartRevision}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border/50 text-foreground/80 rounded-xl text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Start Revision
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
