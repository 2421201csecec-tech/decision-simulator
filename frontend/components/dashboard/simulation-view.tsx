"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Zap, AlertCircle, TrendingUp } from "lucide-react";
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

function VariableSlider({
  variable,
  value,
  onChange,
}: {
  variable: ExtractionVariable;
  value: number;
  onChange: (v: number) => void;
}) {
  const [lo, hi] = variable.range ?? [0, 1];
  const importanceColor =
    variable.importance === "critical"
      ? "text-accent"
      : variable.importance === "high"
        ? "text-foreground/80"
        : "text-muted-foreground";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{variable.name}</span>
          <span className={`text-xs ${importanceColor}`}>({variable.importance})</span>
        </div>
        <span className="text-sm font-medium text-accent tabular-nums">
          {Number.isInteger(value) ? value : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={lo}
        max={hi}
        step={(hi - lo) / 100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--accent))]"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
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
        className="w-full px-3 py-2 bg-secondary border border-border/50 rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
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

function ResultsTable({
  options,
  winnerId,
  caseView,
}: {
  options: SimulationOption[];
  winnerId: string | null | undefined;
  caseView: CaseView;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/30">
            <th className="text-left py-2 pr-3 font-medium">Option</th>
            <th className="text-right py-2 px-2 font-medium">Utility</th>
            <th className="text-right py-2 px-2 font-medium">Downside</th>
            <th className="text-right py-2 px-2 font-medium">CVaR</th>
            <th className="text-right py-2 pl-2 font-medium">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {options.map((opt) => {
            const isWinner = opt.id === winnerId;
            return (
              <tr key={opt.id} className={isWinner ? "bg-accent/5" : ""}>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className={isWinner ? "text-foreground font-medium" : "text-foreground/70"}>
                      {opt.label || opt.id}
                    </span>
                    {isWinner && (
                      <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
                        winner
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right py-2.5 px-2 tabular-nums text-foreground/80">
                  {caseValue(opt, caseView).toFixed(3)}
                </td>
                <td className="text-right py-2.5 px-2 tabular-nums text-foreground/80">
                  {pct(opt.downside)}
                </td>
                <td className="text-right py-2.5 px-2 tabular-nums text-foreground/80">
                  {opt.cvar.toFixed(3)}
                </td>
                <td className="text-right py-2.5 pl-2 tabular-nums font-medium text-foreground">
                  {opt.score.toFixed(3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
            defaults[v.variable_id] = (lo + hi) / 2;
          } else if (v.type === "categorical") {
            defaults[v.variable_id] = 0;
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
            <div className="space-y-5 p-4 bg-secondary/40 rounded-xl border border-border/30">
              {variables.map((v) => {
                const val = userValues[v.variable_id] ?? 0;
                const set = (n: number) => setUserValues((prev) => ({ ...prev, [v.variable_id]: n }));
                if (v.type === "categorical") {
                  return <VariableCategorical key={v.variable_id} variable={v} value={val} onChange={set} />;
                }
                if (v.type === "boolean") {
                  return <VariableBoolean key={v.variable_id} variable={v} value={val} onChange={set} />;
                }
                return <VariableSlider key={v.variable_id} variable={v} value={val} onChange={set} />;
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-secondary/40 rounded-xl border border-border/30 text-sm text-muted-foreground">
            No extraction schema yet. Complete the Clarify and Pressure Test stages first to generate simulation variables.
          </div>
        )}

        {/* Run button */}
        <button
          onClick={handleRunSimulation}
          disabled={running || variables.length === 0}
          className="w-full px-4 py-3 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? "Running 10,000 simulations..." : "Run Simulation →"}
        </button>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {options && options.length > 0 && (
          <div className="space-y-4">
            {/* Winner banner */}
            {winner && (
              <div className="p-4 bg-accent/10 rounded-xl border border-accent/30 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Recommended</p>
                  <p className="text-base font-medium text-foreground">{winner.label || winner.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Score</p>
                  <p className="text-xl font-semibold text-accent">{winner.score.toFixed(3)}</p>
                </div>
              </div>
            )}

            {/* Case toggle */}
            <div className="flex rounded-lg border border-border/50 overflow-hidden text-xs">
              {(["best", "base", "worst"] as CaseView[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCaseView(c)}
                  className={`flex-1 py-1.5 font-medium transition-colors ${
                    caseView === c
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c === "best" ? "Best Case" : c === "base" ? "Base Case" : "Worst Case"}
                </button>
              ))}
            </div>

            {/* Options table */}
            <ResultsTable options={options} winnerId={winnerId} caseView={caseView} />

            {/* Explanation */}
            {explanation && (
              <div className="space-y-3 pt-2 border-t border-border/30">
                <div className="flex gap-2.5 p-3.5 bg-accent/10 rounded-xl border border-accent/20">
                  <Zap className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">Verdict</p>
                    <p className="text-sm text-foreground/80">{explanation.verdict}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 p-3.5 bg-secondary/60 rounded-xl border border-border/30">
                  <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">Risk Alert</p>
                    <p className="text-sm text-foreground/70">{explanation.risk_alert}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 p-3.5 bg-secondary/60 rounded-xl border border-border/30">
                  <TrendingUp className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">Key Assumption</p>
                    <p className="text-sm text-foreground/70">{explanation.key_assumption}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
