"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Lock, Save, RotateCcw } from "lucide-react";
import { fetchDecisionOutput, type DecisionOutputData } from "@/lib/api/threads";

interface DecisionOutputProps {
  threadId?: string | null;
  onBack: () => void;
  onRunSimulation: () => void;
  onStartRevision: () => void;
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

    return () => {
      active = false;
    };
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
    <div className="h-full flex flex-col p-6 overflow-y-auto scroll-container">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={onBack}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-serif text-foreground">Decision Output</h2>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-2xl w-full">
        {/* Decision Title Section */}
        <div className="mb-8">
          <p className="text-sm text-muted-foreground mb-1">Decision</p>
          <h3 className="text-3xl font-serif text-foreground">{output.decisionTitle}</h3>
        </div>

        {/* Final Decision Section */}
        <div className="mb-8">
          <h4 className="text-lg font-serif text-foreground mb-4">Final Decision</h4>
          <div className="p-5 bg-secondary/30 rounded-xl border border-border/30 space-y-2">
            <p className="text-foreground leading-relaxed">{output.finalDecision}</p>
          </div>
        </div>

        {/* Key Reasons and Key Risks - Two Column */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Key Reasons */}
          <div>
            <h4 className="text-lg font-serif text-foreground mb-4">Key Reasons</h4>
            <ul className="space-y-3">
              {output.keyReasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-3 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Key Risks */}
          <div>
            <h4 className="text-lg font-serif text-foreground mb-4">Key Risks</h4>
            <ul className="space-y-3">
              {output.keyRisks.map((risk, index) => (
                <li key={index} className="flex items-start gap-3 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Assumptions and Confidence Level - Two Column */}
        <div className="grid grid-cols-2 gap-6 mb-10">
          {/* Assumptions */}
          <div>
            <h4 className="text-lg font-serif text-foreground mb-4">Assumptions</h4>
            <ul className="space-y-3">
              {output.assumptions.map((assumption, index) => (
                <li key={index} className="flex items-start gap-3 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>{assumption}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Confidence Level */}
          <div>
            <h4 className="text-lg font-serif text-foreground mb-4">Confidence Level</h4>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-medium text-foreground">Decision Strength:</span>
                <span className="text-2xl font-serif text-accent">{output.decisionStrength}%</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${output.decisionStrength}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 gap-4">
          <button 
            onClick={onRunSimulation}
            className="px-5 py-2.5 bg-secondary border border-border/50 text-foreground/80 rounded-full text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Run Simulation
          </button>

          <button className="px-6 py-2.5 bg-accent text-accent-foreground rounded-full text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2 shadow-lg shadow-accent/20">
            <Save className="w-4 h-4" />
            Save Decision
          </button>

          <button 
            onClick={onStartRevision}
            className="px-5 py-2.5 bg-secondary border border-border/50 text-foreground/80 rounded-full text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Start Revision
          </button>
        </div>
        {error && <p className="text-xs text-destructive pt-2">{error}</p>}
      </div>
    </div>
  );
}
