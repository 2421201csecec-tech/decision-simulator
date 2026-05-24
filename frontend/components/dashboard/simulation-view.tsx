"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, AlertCircle, TrendingUp } from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Slider } from "@/components/ui/slider";
import {
  fetchSimulationState,
  runThreadSimulation,
  type ExtractionVariable,
  type ExplanationBullet,
  type SimulationOption,
  type SimulationRun,
} from "@/lib/api/threads";

interface SimulationViewProps {
  threadId?: string | null;
  onBack: () => void;
}

type CaseView = "pessimistic" | "base" | "aggressive";

const SCENARIOS: CaseView[] = ["pessimistic", "base", "aggressive"];
const OPTION_COLORS = ["#c9b896", "#a78bfa", "#fbbf24", "#34d399"];

function caseValue(option: SimulationOption, view: CaseView): number {
  if (view === "aggressive") return option.best_case;
  if (view === "pessimistic") return option.worst_case;
  return option.base_case;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function toDisplayName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatWithUnit(n: number, unit?: string, hi?: number): string {
  const u = (unit ?? "").toLowerCase().trim();

  if (u.includes("%") || u.includes("percent") || u.includes("rate") || u.includes("retention")) {
    const display = n <= 1 ? n * 100 : n;
    return `${parseFloat(display.toFixed(1))}%`;
  }
  if (u.includes("$") || u.includes("usd") || u.includes("dollar")) {
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
    return `$${Math.round(n)}`;
  }
  if (u.includes("₹") || u.includes("rs") || u.includes("inr") || u.includes("rupee") || u.includes("lakh")) {
    return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
  }
  if (u.includes("user")) return `${Math.round(n)} users`;
  if (u.includes("day") || u === "d") return `${Math.round(n)}d`;
  if (u.includes("month")) return `${Math.round(n)}mo`;
  if (u.includes("/5") || u.includes("scale") || u.includes("score")) {
    return `${Math.round(n)}/${hi != null ? Math.round(hi) : 5}`;
  }
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat("en-IN").format(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  return parseFloat(n.toFixed(2)).toString();
}

function sliderStep(lo: number, hi: number): number {
  const span = hi - lo;
  if (Number.isInteger(lo) && Number.isInteger(hi) && span <= 50) return 1;
  return parseFloat((span / 100).toPrecision(2));
}

function isRatingScale(lo: number, hi: number, unit?: string): boolean {
  const u = (unit ?? "").toLowerCase().trim();
  const hasMeaningfulUnit =
    u.includes("%") || u.includes("percent") || u.includes("rate") ||
    u.includes("$") || u.includes("usd") || u.includes("dollar") ||
    u.includes("₹") || u.includes("rs") || u.includes("inr") || u.includes("rupee") ||
    u.includes("user") || u.includes("day") || u.includes("month");
  if (hasMeaningfulUnit) return false;
  return Number.isInteger(lo) && Number.isInteger(hi) && (hi - lo) <= 10;
}

function importancePill(importance: ExtractionVariable["importance"]) {
  const styles: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400",
    high: "bg-violet-500/20 text-violet-400",
    medium: "bg-green-500/20 text-green-400",
    low: "bg-secondary text-muted-foreground",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${styles[importance] ?? styles.low}`}>
      {importance}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Distribution chart helpers
// ---------------------------------------------------------------------------

function buildMergedPoints(opts: SimulationOption[]): Record<string, number>[] {
  const ref = opts[0]?.histogram;
  if (!ref?.length) return [];
  return ref.map(([x], i) => {
    const point: Record<string, number> = { x };
    for (const opt of opts) {
      const bins = opt.histogram ?? [];
      const density = bins[i]?.[1] ?? 0;
      const peak = Math.max(...bins.map(([, d]) => d), 1e-9);
      point[opt.id] = density / peak;
    }
    return point;
  });
}

function peakX(opt: SimulationOption): number {
  const bins = opt.histogram ?? [];
  if (!bins.length) return opt.base_case;
  let best = bins[0];
  for (const b of bins) if (b[1] > best[1]) best = b;
  return best[0];
}

function histPercentile(histogram: [number, number][], pct: number): number {
  if (!histogram.length) return 0.5;
  const binWidth = histogram.length > 1 ? histogram[1][0] - histogram[0][0] : 0.02;
  let cum = 0;
  for (const [x, d] of histogram) {
    cum += d * binWidth;
    if (cum >= pct) return x;
  }
  return histogram[histogram.length - 1][0];
}

function OutcomeLandscapeHeader({
  scenario,
  winner,
}: {
  scenario: CaseView;
  winner: SimulationOption;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-accent/12 via-border/5 to-accent/12 p-px">
    <div className="space-y-3 text-center rounded-2xl bg-secondary/30 px-6 py-6">
      <div>
        <p className="text-sm font-bold tracking-widest uppercase bg-gradient-to-r from-accent via-foreground to-accent bg-clip-text text-transparent">Outcome Landscape</p>
        <h3 className="text-3xl font-extrabold leading-snug mt-2 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
          Make uncertainty visible before committing.
        </h3>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {[
          `${scenario} scenario`,
          "10,000 Monte Carlo runs",
          "Balanced utility",
          `${winner.label || winner.id} leading`,
        ].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border/60 bg-gradient-to-b from-secondary/80 to-secondary/30 px-4 py-1.5 text-sm text-foreground/80 shadow-inner"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
    </div>
  );
}

function ScenarioSlider({
  scenario,
  onChange,
}: {
  scenario: CaseView;
  onChange: (s: CaseView) => void;
}) {
  const idx = SCENARIOS.indexOf(scenario);
  const fillPct = idx === 0 ? 0 : idx === 1 ? 50 : 100;

  return (
    <div className="flex justify-center">
      <div className="w-[78%]">
        {/* Track + nodes */}
        <div className="relative flex items-center justify-between">
          {/* Background track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-[#3d3830] rounded-full" />
          {/* Filled track */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-accent rounded-full transition-all duration-300"
            style={{ width: `${fillPct}%` }}
          />
          {/* Nodes */}
          {SCENARIOS.map((s) => (
            <button
              key={s}
              onClick={() => onChange(s)}
              className="relative z-10 flex flex-col items-center gap-2.5 group"
            >
              <div
                className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                  s === scenario
                    ? "bg-accent border-accent shadow-[0_0_8px_rgba(201,184,150,0.5)]"
                    : "bg-background border-[#3d3830] group-hover:border-accent/60"
                }`}
              />
            </button>
          ))}
        </div>
        {/* Labels */}
        <div className="flex justify-between mt-3">
          {SCENARIOS.map((s) => (
            <span
              key={s}
              className={`text-sm capitalize transition-colors cursor-pointer ${
                s === scenario ? "text-accent font-semibold" : "text-muted-foreground"
              }`}
              onClick={() => onChange(s)}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DistributionChart({
  options,
  winner,
  caseView,
  confidence,
}: {
  options: SimulationOption[];
  winner: SimulationOption;
  caseView: CaseView;
  confidence: number | null | undefined;
}) {
  const mergedPoints = buildMergedPoints(options);
  const hasData = mergedPoints.length > 0;

  const xDomain: [number, number] = (() => {
    if (!hasData) return [0, 1];
    const threshold = 0.05;
    const xs = mergedPoints
      .filter((p) => options.some((o) => (p[o.id] as number) > threshold))
      .map((p) => p.x as number);
    const lo = Math.max(0, Math.min(...xs) - 0.08);
    const hi = Math.min(1, Math.max(...xs) + 0.08);
    return [parseFloat(lo.toFixed(1)), parseFloat(hi.toFixed(1))];
  })();

  // Overlap region — x range where all options have normalized density > threshold
  const overlapRange: [number, number] | null = (() => {
    if (options.length < 2) return null;
    const xs = mergedPoints
      .filter((p) => options.every((o) => (p[o.id] as number) > 0.15))
      .map((p) => p.x as number);
    if (!xs.length) return null;
    return [Math.min(...xs), Math.max(...xs)];
  })();

  // IQR bands (p25–p75) and peak x per option
  const optMeta = options.map((opt) => ({
    id: opt.id,
    px: peakX(opt),
    p25: histPercentile(opt.histogram ?? [], 0.25),
    p75: histPercentile(opt.histogram ?? [], 0.75),
  }));

  // Gap annotation between winner peak and runner-up peak
  const winnerPeak = optMeta.find((m) => m.id === winner.id)?.px ?? winner.base_case;
  const runnerUp = options.find((o) => o.id !== winner.id);
  const runnerPeak = runnerUp ? (optMeta.find((m) => m.id === runnerUp.id)?.px ?? runnerUp.base_case) : null;
  const gap = runnerPeak != null ? ((winnerPeak - runnerPeak) * 100).toFixed(1) : null;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-border/30 bg-secondary/20 h-[190px] flex items-center justify-center">
        <p className="text-xs text-muted-foreground/50 italic">Run simulation to see distribution chart</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Distribution field: utility score over simulated futures</p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={mergedPoints} margin={{ top: 8, right: 8, bottom: 16, left: -28 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={xDomain}
            ticks={Array.from({ length: 6 }, (_, i) => parseFloat((xDomain[0] + (i * (xDomain[1] - xDomain[0])) / 5).toFixed(2)))}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={{ fontSize: 10, fill: "#8a8279" }}
            axisLine={{ stroke: "#2e2a27" }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={() => null} />

          {/* IQR bands (p25–p75) per option — typical outcome range */}
          {optMeta.map((m, i) => (
            <ReferenceArea
              key={`iqr-${m.id}`}
              x1={m.p25} x2={m.p75}
              fill={OPTION_COLORS[i % OPTION_COLORS.length]}
              fillOpacity={0.06}
            />
          ))}

          {/* Overlap region — where decision is ambiguous */}
          {overlapRange && (
            <ReferenceArea
              x1={overlapRange[0]} x2={overlapRange[1]}
              fill="#8a8279" fillOpacity={0.12}
            />
          )}

          {/* Neutral line */}
          <ReferenceLine x={0.5} stroke="#5a5450" strokeDasharray="4 3"
            label={{ value: "neutral", position: "insideTopLeft", fontSize: 9, fill: "#5a5450" }} />

          {/* Mean lines — center of mass per option */}
          {options.map((opt, i) => (
            <ReferenceLine
              key={`mean-${opt.id}`}
              x={opt.mean}
              stroke={OPTION_COLORS[i % OPTION_COLORS.length]}
              strokeWidth={1}
              strokeOpacity={0.35}
            />
          ))}

          {/* Winner — filled area curve */}
          <Area
            dataKey={winner.id}
            name={winner.label || winner.id}
            stroke={OPTION_COLORS[options.findIndex((o) => o.id === winner.id) % OPTION_COLORS.length]}
            strokeWidth={2}
            fill={OPTION_COLORS[options.findIndex((o) => o.id === winner.id) % OPTION_COLORS.length]}
            fillOpacity={0.13}
            dot={false}
            type="monotone"
            isAnimationActive={false}
          />

          {/* Other options — line only */}
          {options.filter((o) => o.id !== winner.id).map((opt, i) => (
            <Line
              key={opt.id}
              dataKey={opt.id}
              name={opt.label || opt.id}
              stroke={OPTION_COLORS[(options.findIndex((o) => o.id === opt.id)) % OPTION_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              type="monotone"
              strokeOpacity={0.65}
              isAnimationActive={false}
            />
          ))}

          {/* Peak markers — vertical line at distribution peak per option */}
          {optMeta.map((m, i) => (
            <ReferenceLine
              key={`peak-${m.id}`}
              x={m.px}
              stroke={OPTION_COLORS[i % OPTION_COLORS.length]}
              strokeWidth={1}
              strokeOpacity={0.5}
              strokeDasharray="2 2"
            />
          ))}

          {/* Scenario markers — solid tick at caseValue */}
          {options.map((opt, i) => (
            <ReferenceLine
              key={`mark-${opt.id}`}
              x={caseValue(opt, caseView)}
              stroke={OPTION_COLORS[i % OPTION_COLORS.length]}
              strokeWidth={2}
              strokeOpacity={0.7}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Gap annotation + axis hints */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-muted-foreground/40">← lower utility</span>
        {gap && parseFloat(gap) > 0 && (
          <span className="text-accent font-medium">
            {winner.label || "Winner"} wins in {pct(confidence ?? 0)} of simulations
          </span>
        )}
        <span className="text-muted-foreground/40">higher utility →</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 pt-2">
        {options.map((opt, i) => (
          <div key={opt.id} className="flex items-center gap-2">
            <span
              className={`inline-block rounded-full ${opt.id === winner.id ? "w-4 h-2" : "w-4 h-0.5"}`}
              style={{ backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }}
            />
            <span className={`text-sm ${opt.id === winner.id ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
              {opt.label || opt.id}
              {opt.id === winner.id && <span className="text-accent ml-1.5">↑ winner</span>}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <span className="w-4 h-2.5 rounded-sm inline-block bg-muted-foreground/20" />
          <span className="text-sm text-muted-foreground/60">overlap zone</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variable input components
// ---------------------------------------------------------------------------

function VariableSlider({
  variable,
  value,
  onChange,
  isKeyDriver,
}: {
  variable: ExtractionVariable;
  value: number;
  onChange: (v: number) => void;
  isKeyDriver: boolean;
}) {
  const [lo, hi] = variable.range ?? [0, 1];
  const step = sliderStep(lo, hi);
  const rating = isRatingScale(lo, hi, variable.unit);
  const fmt = (n: number) => rating ? `${Math.round(n)}/${Math.round(hi)}` : formatWithUnit(n, variable.unit, hi);

  return (
    <div className={`p-4 rounded-xl border space-y-3 ${isKeyDriver ? "border-accent/40 bg-accent/5" : "border-border/40 bg-secondary/30"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground font-medium truncate">{toDisplayName(variable.name)}</span>
        <div className="flex items-center gap-1.5">
          {isKeyDriver && <span className="text-xs text-accent font-medium">Key driver</span>}
          {importancePill(variable.importance)}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Slider
          min={lo}
          max={hi}
          step={step}
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          className="flex-1"
        />
        <span className="text-sm font-semibold text-foreground tabular-nums w-16 text-right shrink-0">
          {fmt(value)}
        </span>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{fmt(lo)}</span>
        <span>{fmt(hi)}</span>
      </div>
    </div>
  );
}

function VariableCategorical({
  variable,
  value,
  onChange,
  isKeyDriver,
}: {
  variable: ExtractionVariable;
  value: number;
  onChange: (v: number) => void;
  isKeyDriver: boolean;
}) {
  const options = variable.possible_values ?? [];
  return (
    <div className={`p-4 rounded-xl border space-y-2 ${isKeyDriver ? "border-accent/40 bg-accent/5" : "border-border/40 bg-secondary/30"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground font-medium truncate">{toDisplayName(variable.name)}</span>
        <div className="flex items-center gap-1.5">
          {isKeyDriver && <span className="text-xs text-accent font-medium">Key driver</span>}
          {importancePill(variable.importance)}
        </div>
      </div>
      <select
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[78%] px-3 py-2 bg-secondary border border-border/50 rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
      >
        {options.map((opt, idx) => (
          <option key={idx} value={idx}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function VariableBoolean({
  variable,
  value,
  onChange,
  isKeyDriver,
}: {
  variable: ExtractionVariable;
  value: number;
  onChange: (v: number) => void;
  isKeyDriver: boolean;
}) {
  const on = value > 0.5;
  return (
    <div className={`p-4 rounded-xl border flex items-center justify-between ${isKeyDriver ? "border-accent/40 bg-accent/5" : "border-border/40 bg-secondary/30"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-foreground font-medium truncate">{toDisplayName(variable.name)}</span>
        {isKeyDriver && <span className="text-xs text-accent font-medium shrink-0">Key driver</span>}
        {importancePill(variable.importance)}
      </div>
      <button
        onClick={() => onChange(on ? 0 : 1)}
        className={`w-10 h-5 rounded-full transition-colors shrink-0 ml-3 ${on ? "bg-accent" : "bg-secondary border border-border/50"}`}
      >
        <span className={`block w-4 h-4 mx-0.5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SimulationView({ threadId, onBack }: SimulationViewProps) {
  const [variables, setVariables] = useState<ExtractionVariable[]>([]);
  const [userValues, setUserValues] = useState<Record<string, number>>({});
  const [latestRun, setLatestRun] = useState<SimulationRun | null>(null);
  const [caseView, setCaseView] = useState<CaseView>("base");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) { setLoading(false); return; }
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const { run, extractionSchema } = await fetchSimulationState(threadId);
        if (!active) return;
        setLatestRun(run);
        const vars: ExtractionVariable[] = ((extractionSchema?.variables ?? []) as ExtractionVariable[]).filter(
          (v) => ["continuous", "ordinal", "categorical", "boolean", "discrete"].includes(v.type)
        );
        setVariables(vars);
        const defaults: Record<string, number> = {};
        for (const v of vars) {
          if (v.type === "continuous" || v.type === "ordinal") {
            const [lo, hi] = v.range ?? [0, 1];
            defaults[v.variable_id] = (lo + hi) / 2;
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
  const keyVariableId = latestRun?.key_variable_id;
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
        {options && winner && confidence != null && (
          <div className="ml-auto flex items-center gap-2 text-xs">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: Math.round(confidence * 100) > 70 ? "#15803d" : Math.round(confidence * 100) >= 40 ? "#facc15" : "#ef4444" }} />
            <span style={{ color: Math.round(confidence * 100) > 70 ? "#15803d" : Math.round(confidence * 100) >= 40 ? "#facc15" : "#ef4444" }}>
              Confidence: {pct(confidence)}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Variables */}
        {variables.length > 0 ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Simulation Variables</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adjust values to set your scenario · Monte Carlo 10,000 runs
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {variables.map((v) => {
                const val = userValues[v.variable_id] ?? 0;
                const set = (n: number) => setUserValues((prev) => ({ ...prev, [v.variable_id]: n }));
                const isKeyDriver = keyVariableId === v.variable_id;
                if (v.type === "categorical") {
                  return <VariableCategorical key={v.variable_id} variable={v} value={val} onChange={set} isKeyDriver={isKeyDriver} />;
                }
                if (v.type === "boolean") {
                  return <VariableBoolean key={v.variable_id} variable={v} value={val} onChange={set} isKeyDriver={isKeyDriver} />;
                }
                return <VariableSlider key={v.variable_id} variable={v} value={val} onChange={set} isKeyDriver={isKeyDriver} />;
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-secondary/40 rounded-xl border border-border/30 text-sm text-muted-foreground">
            No extraction schema yet. Complete the Clarify and Pressure Test stages first.
          </div>
        )}

        {/* Run button */}
        <div className="flex justify-center">
          <button
            onClick={handleRunSimulation}
            disabled={running || variables.length === 0}
            className="px-10 py-3 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="space-y-5 mt-6">
            {/* Outcome Landscape header — centered */}
            <OutcomeLandscapeHeader scenario={caseView} winner={winner} />

            {/* Recommended decision — below header tagline, above slider */}
            <div className="p-4 bg-accent/10 rounded-xl border border-accent/30">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-1">Recommended Decision</p>
              <div className="flex items-end justify-between">
                <p className="text-base font-medium text-foreground">{winner.label || winner.id}</p>
                <p className="text-xl font-semibold text-accent tabular-nums mr-2">{Math.round(winner.score * 100)}%</p>
              </div>
            </div>

            {/* 3-snap scenario slider */}
            <div className="mt-10">
              <ScenarioSlider scenario={caseView} onChange={setCaseView} />
            </div>

            {/* Distribution chart */}
            <DistributionChart options={options} winner={winner} caseView={caseView} confidence={confidence} />

            {/* Key Metrics */}
            {(() => {
              const caseBg = caseView === "pessimistic" ? "bg-destructive/5 border-destructive/20" : caseView === "aggressive" ? "bg-accent/5 border-accent/20" : "bg-secondary/40 border-border/30";
              const metrics = [
                {
                  label: "Utility",
                  value: caseValue(winner, caseView).toFixed(3),
                  sub: caseView === "aggressive" ? "Best 20% of outcomes" : caseView === "pessimistic" ? "Worst 20% of outcomes" : "Median outcome",
                },
                { label: "Downside probability", value: pct(winner.downside), sub: "Across all 10,000 runs" },
                { label: "CVaR (tail risk)", value: winner.cvar.toFixed(3), sub: "Across all 10,000 runs" },
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

            {/* Explanation cards */}
            {explanation && (() => {
              const bullets: ExplanationBullet[] | undefined =
                caseView === "aggressive" ? explanation.ideal_case
                : caseView === "pessimistic" ? explanation.worst_case
                : explanation.base_case;

              const tagColor = (tag?: string) => {
                const t = (tag ?? "").toLowerCase();
                if (t.includes("high") || t.includes("tail") || t.includes("severe")) return "bg-red-500/20 text-red-400 border-red-500/30";
                if (t.includes("medium") || t.includes("watch") || t.includes("tradeoff") || t.includes("key")) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
                if (t.includes("upside") || t.includes("strong") || t.includes("opportunity")) return "bg-green-500/20 text-green-400 border-green-500/30";
                return "bg-secondary text-muted-foreground border-border/40";
              };

              const accentBar = (tag?: string) => {
                const t = (tag ?? "").toLowerCase();
                if (t.includes("high") || t.includes("tail") || t.includes("severe")) return "bg-red-500/60";
                if (t.includes("medium") || t.includes("watch") || t.includes("tradeoff") || t.includes("key")) return "bg-amber-500/60";
                if (t.includes("upside") || t.includes("strong") || t.includes("opportunity")) return "bg-green-500/60";
                return "bg-accent/40";
              };

              return (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What this means for you</p>
                  {bullets && bullets.length > 0 ? (
                    <div className="space-y-3">
                      {bullets.map((b, i) => {
                        const isLegacy = typeof b === "string";
                        const title = isLegacy ? "" : b.title;
                        const description = isLegacy ? (b as unknown as string) : b.description;
                        const tag = isLegacy ? undefined : b.tag;
                        return (
                          <div key={i} className="flex gap-3 p-4 rounded-xl border border-border/40 bg-secondary/20">
                            <div className={`w-0.5 rounded-full shrink-0 self-stretch ${accentBar(tag)}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 mb-1.5">
                                {title && <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>}
                                {tag && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 font-medium ${tagColor(tag)}`}>
                                    {tag}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-foreground/75 leading-relaxed">{description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-border/30 bg-secondary/20">
                      <p className="text-sm text-foreground/70">{explanation.verdict}</p>
                    </div>
                  )}
                </div>
              );
            })()}

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
