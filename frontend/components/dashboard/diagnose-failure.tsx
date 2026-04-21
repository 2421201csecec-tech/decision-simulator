"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchFailureAnalysis, saveFailureAnalysis } from "@/lib/api/threads";

interface DiagnoseFailureProps {
  threadId?: string | null;
  failedDecision: string;
  onBack: () => void;
  onRebuild: () => void;
}

export function DiagnoseFailure({ threadId, failedDecision, onBack, onRebuild }: DiagnoseFailureProps) {
  const [whatHappened, setWhatHappened] = useState("");
  const [observations, setObservations] = useState<string[]>([
    "Market rejected pricing",
    "Competitor launched cheaper alternative",
    "Users didn't see enough value",
  ]);
  const [failedAssumptions, setFailedAssumptions] = useState<string[]>([
    "Users would accept ₹2999 pricing",
    "Brand perceived as premium",
  ]);
  const [rootCause, setRootCause] = useState("");
  const [newObservation, setNewObservation] = useState("");
  const [newAssumption, setNewAssumption] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) {
      setLoading(false);
      setError("Select a thread to run failure analysis.");
      return;
    }

    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchFailureAnalysis(threadId);
        if (!active) return;

        setWhatHappened(data.whatHappened);
        setObservations(data.observations);
        setFailedAssumptions(data.failedAssumptions);
        setRootCause(data.rootCause);
      } catch {
        if (!active) return;
        setError("Unable to load failure analysis.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [threadId]);

  const handleAddObservation = () => {
    if (newObservation.trim()) {
      setObservations([...observations, newObservation]);
      setNewObservation("");
    }
  };

  const handleRemoveObservation = (index: number) => {
    setObservations(observations.filter((_, i) => i !== index));
  };

  const handleAddAssumption = () => {
    if (newAssumption.trim()) {
      setFailedAssumptions([...failedAssumptions, newAssumption]);
      setNewAssumption("");
    }
  };

  const handleRemoveAssumption = (index: number) => {
    setFailedAssumptions(failedAssumptions.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!threadId || saving) return;

    try {
      setSaving(true);
      setError(null);
      await saveFailureAnalysis(threadId, {
        whatHappened,
        observations,
        failedAssumptions,
        rootCause,
      });
    } catch {
      setError("Failed to save failure analysis.");
    } finally {
      setSaving(false);
    }
  };

  const handleRebuildClick = async () => {
    await handleSave();
    onRebuild();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading failure analysis...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 pb-6 border-b border-border/30">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/30"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Diagnose Failure</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto scroll-container space-y-6 py-6 px-6">
        {/* Decision That Failed */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Decision That Failed</p>
          <p className="text-lg font-medium text-foreground">{failedDecision}</p>
        </div>

        {/* What Actually Happened */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-3">What actually happened?</label>
          <textarea
            value={whatHappened}
            onChange={(e) => setWhatHappened(e.target.value)}
            placeholder="Describe the outcome of the decision…"
            className="w-full px-4 py-3 bg-secondary border border-border/50 rounded-xl text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all resize-none"
            rows={5}
          />
        </div>

        {/* What Went Wrong & Failed Assumptions - Two Column */}
        <div className="grid grid-cols-2 gap-6">
          {/* What Went Wrong */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">What went wrong?</h3>
            <ul className="space-y-2 mb-4">
              {observations.map((obs, idx) => (
                <li key={idx} className="flex items-start gap-2 group">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span className="text-sm text-foreground/80 flex-1">{obs}</span>
                  <button
                    onClick={() => handleRemoveObservation(idx)}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5 text-destructive hover:bg-destructive/10 rounded transition-all"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {/* Add Observation Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newObservation}
                onChange={(e) => setNewObservation(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddObservation()}
                placeholder="Add observation..."
                className="flex-1 px-3 py-1.5 bg-secondary border border-border/50 rounded-lg text-xs text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={handleAddObservation}
                className="px-3 py-1.5 text-accent hover:text-accent/80 transition-colors text-xs font-medium"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Failed Assumptions */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Which assumption proved wrong?</h3>
            <ul className="space-y-2 mb-4">
              {failedAssumptions.map((assumption, idx) => (
                <li key={idx} className="flex items-start gap-2 group">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span className="text-sm text-foreground/80 flex-1">{assumption}</span>
                  <button
                    onClick={() => handleRemoveAssumption(idx)}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5 text-destructive hover:bg-destructive/10 rounded transition-all"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {/* Add Failed Assumption Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newAssumption}
                onChange={(e) => setNewAssumption(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddAssumption()}
                placeholder="Add failed assumption..."
                className="flex-1 px-3 py-1.5 bg-secondary border border-border/50 rounded-lg text-xs text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={handleAddAssumption}
                className="px-3 py-1.5 text-accent hover:text-accent/80 transition-colors text-xs font-medium"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Root Cause */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-3">Root Cause</label>
          <textarea
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            placeholder="Describe the root issue…"
            className="w-full px-4 py-3 bg-secondary border border-border/50 rounded-xl text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all resize-none"
            rows={4}
          />
        </div>
      </div>

      {/* Rebuild Button */}
      <div className="border-t border-border/30 pt-6 px-6 pb-6">
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !threadId}
            className="flex-1 px-6 py-3 bg-secondary border border-border/50 text-foreground rounded-full text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Analysis"}
          </button>
          <button
            onClick={handleRebuildClick}
            disabled={saving || !threadId}
            className="flex-1 px-6 py-3 bg-accent text-accent-foreground rounded-full text-sm font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Rebuild Decision
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>
        {error && <p className="text-xs text-destructive pt-3">{error}</p>}
      </div>
    </div>
  );
}
