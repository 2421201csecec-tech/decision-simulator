"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronRight, ChevronLeft, MoreHorizontal, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type DraftInsights, type PressureTestState } from "@/lib/api/threads";
import { deriveInsights } from "@/lib/insights/derive-insights";

interface ClarifyDraft {
  title?: string;
  coreProblem?: string;
  desiredOutcome?: string;
  context?: string;
  constraints?: string[];
  assumptions?: string[];
}

interface FailureInsights {
  likelyRootCause: string;
  cognitiveBias: string;
  missedVariable: string;
  recommendation: string;
}

interface RightPanelProps {
  view: "home" | "clarify" | "pressure-test" | "decision-output" | "simulation" | "failure-analysis";
  threadId?: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRunSimulation?: () => void;
  onStartRevision?: () => void;
  clarifyInsights?: DraftInsights | null;
  isAnalyzingDraft?: boolean;
  pressureTestState?: PressureTestState | null;
  extractionSchema?: Record<string, unknown> | null;
  clarifyDraft?: ClarifyDraft | null;
  failureInsights?: FailureInsights | null;
}

const TICKER_SEQUENCE = [
  { text: "AI Thinking Assistant", isTask: false },
  { text: "Loading context...", isTask: true },
  { text: "Scanning biases...", isTask: true },
  { text: "Running Kautilya...", isTask: true },
  { text: "Weighing trade-offs...", isTask: true },
  { text: "Kautilya is ready", isTask: false },
  { text: "Mapping decisions...", isTask: true },
  { text: "Stress-testing logic...", isTask: true },
  { text: "Checking assumptions...", isTask: true },
  { text: "Your Thinking Assistant", isTask: false },
  { text: "Updating suggestions...", isTask: true },
  { text: "Detecting blind spots...", isTask: true },
  { text: "Kautilya is thinking...", isTask: true },
  { text: "Your Thinking Assistant", isTask: false },
];

function TickerHeader() {
  const [displayText, setDisplayText] = useState(TICKER_SEQUENCE[0].text);
  const [isTask, setIsTask] = useState(false);
  const [animClass, setAnimClass] = useState("");
  const idxRef = useRef(0);

  useEffect(() => {
    let active = true;
    const timers: number[] = [];

    const tick = () => {
      if (!active) return;
      const current = TICKER_SEQUENCE[idxRef.current];
      const delay = current.isTask ? 1400 : 2600;

      const t1 = window.setTimeout(() => {
        if (!active) return;
        setAnimClass("ticker-exit");
        const t2 = window.setTimeout(() => {
          if (!active) return;
          idxRef.current = (idxRef.current + 1) % TICKER_SEQUENCE.length;
          const next = TICKER_SEQUENCE[idxRef.current];
          setDisplayText(next.text);
          setIsTask(next.isTask);
          setAnimClass("ticker-enter");
          const t3 = window.setTimeout(() => {
            if (!active) return;
            setAnimClass("");
            tick();
          }, 400);
          timers.push(t3);
        }, 360);
        timers.push(t2);
      }, delay);
      timers.push(t1);
    };

    tick();
    return () => {
      active = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 flex-1 justify-center">
      <div className="h-5 overflow-hidden flex items-center" style={{ perspective: "300px" }}>
        <span
          className={`whitespace-nowrap block ${
            isTask ? "text-xs text-muted-foreground" : "text-sm font-medium text-foreground"
          } ${animClass}`}
        >
          {displayText}
        </span>
      </div>
      <div className="flex gap-[3px] items-center">
        {[0, 0.2, 0.4].map((delay) => (
          <span
            key={delay}
            className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40"
            style={{ animation: `ticker-blink 1.2s ease-in-out ${delay}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

function InsightBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 flex gap-2 leading-snug">
              <span className="text-accent shrink-0 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision Output right panel components
// ---------------------------------------------------------------------------

function confidenceLevel(pct: number): { label: string; subLabel: string; color: string } {
  if (pct >= 80) return { label: "Strong signal", subLabel: "Context clear", color: "#109c56" };
  if (pct >= 60) return { label: "Good signal", subLabel: "Context well-understood", color: "var(--accent)" };
  if (pct >= 40) return { label: "Moderate signal", subLabel: "Some gaps remain", color: "#fbbf24" };
  return { label: "Weak signal", subLabel: "Context unclear", color: "#f87171" };
}

function ConfidenceGauge({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const { label, subLabel, color } = confidenceLevel(pct);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Extraction Confidence</h3>
      <div className="flex items-center gap-4">
        <svg width="90" height="90" viewBox="0 0 90 90" className="shrink-0">
          <circle cx="45" cy="45" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-secondary" transform="rotate(-90 45 45)" />
          <circle
            cx="45" cy="45" r={r} fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 45 45)"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
          <text
            x="45" y="50"
            textAnchor="middle"
            style={{ fontSize: "15px", fontWeight: 600, fill: "currentColor" }}
          >
            {pct}%
          </text>
        </svg>
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{subLabel}</p>
        </div>
      </div>
    </div>
  );
}

function BulletList({ title, items, emptyText, icon }: {
  title: string;
  items: string[];
  emptyText: string;
  icon?: "warning" | "bullet";
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 italic">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 flex gap-2 leading-snug">
              {icon === "warning" ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <span className="text-accent shrink-0 mt-0.5">•</span>
              )}
              <span className="line-clamp-2">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssumptionFragility({ assumptions }: { assumptions: Array<{ text?: string; fragility?: number }> }) {
  const top = [...assumptions]
    .filter((a) => a.text)
    .sort((a, b) => (b.fragility ?? 0) - (a.fragility ?? 0))
    .slice(0, 3);

  if (top.length === 0) return null;

  function dotColor(f: number) {
    if (f >= 0.7) return "bg-red-400";
    if (f >= 0.4) return "bg-amber-400";
    return "bg-green-400";
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assumption Fragility</h3>
      <ul className="space-y-2">
        {top.map((a, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground/80 leading-snug">
            <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dotColor(a.fragility ?? 0)}`} />
            <span className="line-clamp-2">{a.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionOutputInsights({
  extractionSchema,
  pressureTestState,
  insights,
}: {
  extractionSchema: Record<string, unknown> | null | undefined;
  pressureTestState: PressureTestState | null | undefined;
  insights: ReturnType<typeof deriveInsights>;
}) {
  const confidence = (extractionSchema?.confidence as Record<string, number> | undefined)?.overall_confidence ?? 0;
  const hiddenDeps = (extractionSchema?.hidden_deps as string[] | undefined) ?? [];
  const assumptions = (extractionSchema?.assumptions as Array<{ text?: string; fragility?: number }> | undefined) ?? [];
  const synthesis = (pressureTestState?.summary as Record<string, unknown> | null | undefined);
  const whatBelieved = (synthesis?.what_founder_believed as string[] | undefined) ?? [];
  const commitments = (synthesis?.commitments_made as string[] | undefined) ?? [];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto scroll-container">
      <ConfidenceGauge value={confidence} />
      <div className="border-t border-accent/60" />

      <BulletList
        title="Pressure Test Synthesis"
        items={whatBelieved.slice(0, 3)}
        emptyText="Complete pressure test to see synthesis."
      />
      <div className="border-t border-accent/60" />

      <BulletList
        title="Hidden Dependencies"
        items={hiddenDeps.slice(0, 3)}
        emptyText="No hidden dependencies detected."
        icon="warning"
      />
      <div className="border-t border-accent/60" />

      {commitments.length > 0 && (
        <>
          <div className="border-t border-border/30" />
          <BulletList
            title="Commitments Made"
            items={commitments}
            emptyText=""
          />
        </>
      )}
    </div>
  );
}

function FailureAnalysisInsights({ insights }: { insights: FailureInsights }) {
  const items = [
    { label: "Likely Root Cause", value: insights.likelyRootCause },
    { label: "Cognitive Bias", value: insights.cognitiveBias },
    { label: "Missed Variable", value: insights.missedVariable },
    { label: "Recommendation", value: insights.recommendation },
  ].filter((i) => i.value);

  return (
    <div className="flex-1 overflow-y-auto scroll-container space-y-4">
      {items.map((item, i) => (
        <div key={i}>
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</h3>
            <p className="text-sm text-foreground/80 leading-snug">{item.value}</p>
          </div>
          {i < items.length - 1 && <div className="border-t border-accent/60 mt-4" />}
        </div>
      ))}
    </div>
  );
}

export function RightPanel({
  view,
  threadId,
  isCollapsed,
  onToggleCollapse,
  pressureTestState,
  extractionSchema,
  clarifyDraft,
  failureInsights,
}: RightPanelProps) {
  const insights = useMemo(
    () => deriveInsights({ clarifyDraft, extractionSchema, pressureTest: pressureTestState }),
    [clarifyDraft, extractionSchema, pressureTestState]
  );

  const hasThread = Boolean(threadId);

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
    <aside className="w-[330px] h-full bg-card rounded-2xl border border-border/50 p-5 relative flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onToggleCollapse}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {hasThread && <TickerHeader />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/50">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 bg-card border-border">
            <DropdownMenuItem className="cursor-pointer text-foreground hover:bg-secondary focus:bg-secondary">
              View Insights
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-foreground hover:bg-secondary focus:bg-secondary">
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* No thread selected */}
      {!hasThread && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground/40 text-sm text-center italic">
            Start or select a decision to see insights
          </p>
        </div>
      )}

      {/* Decision output view */}
      {hasThread && view === "decision-output" && (
        <DecisionOutputInsights
          extractionSchema={extractionSchema}
          pressureTestState={pressureTestState}
          insights={insights}
        />
      )}

      {/* Failure analysis view */}
      {hasThread && view === "failure-analysis" && (
        failureInsights ? (
          <FailureAnalysisInsights insights={failureInsights} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground/40 text-sm text-center italic">Complete the diagnosis to see insights.</p>
          </div>
        )
      )}

      {/* All other views — generic insight blocks */}
      {hasThread && view !== "decision-output" && view !== "failure-analysis" && (
        <div className="flex-1 space-y-6 overflow-y-auto scroll-container">
          <InsightBlock
            title="Suggestions"
            items={insights.suggestions}
            emptyText="Fill in the clarify form to get suggestions."
          />
          <div className="border-t border-border/30" />
          <InsightBlock
            title="Key Risks"
            items={insights.keyRisks}
            emptyText="Risks will appear after extraction runs."
          />
          <div className="border-t border-border/30" />
          <InsightBlock
            title="Think About"
            items={insights.thinkAbout}
            emptyText="Scenarios load after clarify is complete."
          />
          <div className="border-t border-border/30" />
          <InsightBlock
            title="Thinking Pattern"
            items={
              view === "clarify"
                ? []
                : insights.thinkingPattern
            }
            emptyText="Answer at least one scenario to see your reasoning style."
          />
        </div>
      )}
    </aside>
  );
}
