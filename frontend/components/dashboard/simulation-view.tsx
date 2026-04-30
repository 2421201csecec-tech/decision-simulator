"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, AlertCircle, TrendingUp } from "lucide-react";
import {
  fetchSimulationState,
  runThreadSimulation,
  type ExtractionVariable,
  type SimulationOption,
  type SimulationRun,
} from "@/lib/api/threads";

interface SimulationViewProps {
  threadId?: string | null;
  onBack: () => void;
}

type CaseView = "best" | "base" | "worst";

function caseValue(option: SimulationOption, view: CaseView): number {
  if (view === "best") return option.best_case;
  if (view === "worst") return option.worst_case;
  return option.base_case;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function formatValue(n: number): string {
  if (Math.abs(n) >= 100000) {
    return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
  }
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-IN").format(Math.round(n));
  }
  if (Number.isInteger(n)) return String(n);
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString();
}

function generateRangeOptions(lo: number, hi: number): number[] {
  const span = hi - lo;
  // If small integer range — enumerate all integers
  if (Number.isInteger(lo) && Number.isInteger(hi) && span <= 12) {
    return Array.from({ length: span + 1 }, (_, i) => lo + i);
  }
  // Otherwise 4 evenly-spaced steps: lo, 1/3, 2/3, hi
  return [0, 1, 2, 3].map((i) => lo + (span * i) / 3);
}

function VariableDropdown({
  variable,
  value,
  onChange,
}: {
  variable: ExtractionVariable;
  value: number;
  onChange: (v: number) => void;
}) {
  const [lo, hi] = variable.range ?? [0, 1];
  const options = generateRangeOptions(lo, hi);
  const importanceColor =
    variable.importance === "critical"
      ? "text-accent"
      : variable.importance === "high"
        ? "text-foreground/80"
        : "text-muted-foreground";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{variable.name}</span>
        <span className={`text-xs ${importanceColor}`}>({variable.importance})</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2.5 bg-secondary border border-border/50 rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {formatValue(opt)}
          </option>
        ))}
      </select>
    </div>
  );
}

function VariableCategorical({
  variable,
  value,
  onChange,
}: {
  variable: ExtractionVariable;
  value: number;
  onChange: (v: number) => void;
}) {
  const options = variable.possible_values ?? [];
  const selectedIdx = Math.round(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{variable.name}</span>
        <span className="text-xs text-muted-foreground">({variable.importance})</span>
      </div>
      <select
        value={selectedIdx}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2.5 bg-secondary border border-border/50 rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
      >
        {options.map((opt, idx) => (
          <option key={idx} value={idx}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function VariableBoolean({
  variable,
  value,
  onChange,
}: {
  variable: ExtractionVariable;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{variable.name}</span>
        <span className="text-xs text-muted-foreground">({variable.importance})</span>
      </div>
      <button
        onClick={() => onChange(value > 0.5 ? 0 : 1)}
        className={`w-10 h-5 rounded-full transition-colors ${value > 0.5 ? "bg-accent" : "bg-secondary border border-border/50"}`}
      >
        <span
          className={`block w-4 h-4 mx-0.5 rounded-full bg-white transition-transform ${value > 0.5 ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}


export function SimulationView({ threadId, onBack }: SimulationViewProps) {
  const [variables, setVariables] = useState<ExtractionVariable[]>([]);
  const [userValues, setUserValues] = useState<Record<string, number>>({});
  const [latestRun, setLatestRun] = useState<SimulationRun | null>(null);
  const [caseView, setCaseView] = useState<CaseView>("base");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) {
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const { run, extractionSchema } = await fetchSimulationState(threadId);
        if (!active) return;

        setLatestRun(run);

        const vars: ExtractionVariable[] = ((extractionSchema?.variables ?? []) as ExtractionVariable[]).filter(
          (v) => v.type === "continuous" || v.type === "ordinal" || v.type === "categorical" || v.type === "boolean"
        );
        setVariables(vars);

        const defaults: Record<string, number> = {};
        for (const v of vars) {
          if (v.type === "continuous" || v.type === "ordinal") {
            const [lo, hi] = v.range ?? [0, 1];
            const opts = generateRangeOptions(lo, hi);
            // Default to middle option (index 1 of 4, or midpoint of integer range)
            defaults[v.variable_id] = opts[Math.floor(opts.length / 2)];
          } else {
            defaults[v.variable_id] = 0;
          }
        }
        setUserValues(defaults);
      } catch {
        if (!active) return;
        setError("Unable to load simulation data.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [threadId]);

  const handleRunSimulation = async () => {
    if (!threadId || running) return;
    try {
      setRunning(true);
      setError(null);
      const run = await runThreadSimulation(threadId, userValues);
      setLatestRun(run);
      setCaseView("base");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run simulation.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading simulation...
      </div>
    );
  }

  const options = latestRun?.options;
  const winnerId = latestRun?.winner_id;
  const explanation = latestRun?.explanation;
  const confidence = latestRun?.confidence;
  const winner = options?.find((o) => o.id === winnerId) ?? options?.[0];

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
        <h2 className="text-base font-medium text-foreground">Decision Simulation</h2>
        {options && winner && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Confidence: {confidence != null ? pct(confidence) : "—"}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Variables */}
        {variables.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">Simulation Variables</h3>
            <p className="text-xs text-muted-foreground">
              Adjust values to set your scenario. Monte Carlo samples 10,000 runs around each selection.
            </p>
            <div
              className={`p-4 bg-secondary/40 rounded-xl border border-border/30 grid gap-5 ${
                variables.length >= 9
                  ? "grid-cols-3"
                  : variables.length >= 6
                  ? "grid-cols-2"
                  : "grid-cols-1"
              }`}
            >
              {variables.map((v) => {
                const val = userValues[v.variable_id] ?? 0;
                const set = (n: number) => setUserValues((prev) => ({ ...prev, [v.variable_id]: n }));
                if (v.type === "categorical") {
                  return <VariableCategorical key={v.variable_id} variable={v} value={val} onChange={set} />;
                }
                if (v.type === "boolean") {
                  return <VariableBoolean key={v.variable_id} variable={v} value={val} onChange={set} />;
                }
                return <VariableDropdown key={v.variable_id} variable={v} value={val} onChange={set} />;
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-secondary/40 rounded-xl border border-border/30 text-sm text-muted-foreground">
            No extraction schema yet. Complete the Clarify and Pressure Test stages first to generate simulation variables.
          </div>
        )}

        {/* Run button */}
        <div className="flex justify-center">
          <button
            onClick={handleRunSimulation}
            disabled={running || variables.length === 0}
            className="px-30 py-3 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "Running 10,000 simulations..." : "Run Simulation →"}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {options && options.length > 0 && winner && (
          <div className="space-y-4">
            {/* Recommended Decision banner */}
            <div className="p-4 bg-accent/10 rounded-xl border border-accent/30">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-1">Recommended Decision</p>
              <div className="flex items-end justify-between">
                <p className="text-base font-medium text-foreground">{winner.label || winner.id}</p>
                <p className="text-xl font-semibold text-accent tabular-nums">{winner.score.toFixed(3)}</p>
              </div>
            </div>

            {/* Case toggle — single row, all same accent color */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(["best", "base", "worst"] as CaseView[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCaseView(c)}
                  className={`py-2 rounded-lg font-medium transition-colors border ${
                    caseView === c
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-secondary text-muted-foreground border-border/50 hover:text-foreground"
                  }`}
                >
                  {c === "best" ? "Ideal case" : c === "base" ? "Real world case" : "Worst case"}
                </button>
              ))}
            </div>

            {/* Key Metrics — Utility changes per case, Downside/CVaR are overall */}
            {(() => {
              const caseBg =
                caseView === "worst"
                  ? "bg-destructive/5 border-destructive/20"
                  : caseView === "best"
                  ? "bg-accent/5 border-accent/20"
                  : "bg-secondary/40 border-border/30";
              const metrics = [
                {
                  label: "Utility",
                  value: caseValue(winner, caseView).toFixed(3),
                  sub: caseView === "best" ? "Best 20% of outcomes" : caseView === "worst" ? "Worst 20% of outcomes" : "Median outcome",
                },
                {
                  label: "Downside probability",
                  value: pct(winner.downside),
                  sub: "Across all 10,000 runs",
                },
                {
                  label: "CVaR (tail risk)",
                  value: winner.cvar.toFixed(3),
                  sub: "Across all 10,000 runs",
                },
              ];
              return (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Key Metrics</p>
                  <div className={`grid grid-cols-3 gap-2 p-3 rounded-xl border ${caseBg}`}>
                    {metrics.map(({ label, value, sub }) => (
                      <div key={label} className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-xl font-semibold text-foreground tabular-nums">{value}</p>
                        <p className="text-xs text-muted-foreground/60 leading-snug">{sub}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* What this means for you — bullet points per case */}
            {explanation && (() => {
              const bullets =
                caseView === "best"
                  ? explanation.ideal_case
                  : caseView === "worst"
                  ? explanation.worst_case
                  : explanation.base_case;

              const sectionBg =
                caseView === "worst"
                  ? "bg-destructive/5 border-destructive/15"
                  : caseView === "best"
                  ? "bg-accent/5 border-accent/15"
                  : "bg-secondary/40 border-border/30";

              return (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What this means for you</p>
                  <div className={`p-4 rounded-xl border ${sectionBg}`}>
                    {bullets && bullets.length > 0 ? (
                      <ul className="space-y-2">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-foreground/85">
                            <span className="text-muted-foreground shrink-0 mt-0.5">→</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-foreground/70">{explanation.verdict}</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Key assumption — always visible */}
            {explanation?.key_assumption && (
              <p className="text-xs text-muted-foreground italic px-1">
                Key assumption: {explanation.key_assumption}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
