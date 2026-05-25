"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, Sparkles, AlertTriangle } from "lucide-react";
import { type PressureTestState } from "@/lib/api/threads";

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

interface KautilyaResult {
  suggestions: string[];
  biases: string[];
  thinkAbout: string[];
}

interface RightPanelProps {
  view: "home" | "clarify" | "pressure-test" | "decision-output" | "simulation" | "failure-analysis" | "decision-card";
  threadId?: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRunSimulation?: () => void;
  onStartRevision?: () => void;
  pressureTestState?: PressureTestState | null;
  extractionSchema?: Record<string, unknown> | null;
  clarifyDraft?: ClarifyDraft | null;
  failureInsights?: FailureInsights | null;
  pressureTestAnswer?: string;
  failureRawInput?: string;
}

// ---------------------------------------------------------------------------
// Kautilya hook — debounced AI analysis of raw input
// ---------------------------------------------------------------------------

function useKautilya(text: string, source: string) {
  const [result, setResult] = useState<KautilyaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef("");

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = text.trim();
    if (trimmed.length < 20) {
      setResult(null);
      setLoading(false);
      return;
    }

    if (trimmed === lastTextRef.current) return;

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/kautilya", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmed, source }),
        });
        if (res.ok) {
          const data: KautilyaResult = await res.json();
          lastTextRef.current = trimmed;
          setResult(data);
        }
      } catch {
        // silently fail — non-critical
      } finally {
        setLoading(false);
      }
    }, 3500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, source]);

  return { result, loading };
}

// ---------------------------------------------------------------------------
// Ticker header
// ---------------------------------------------------------------------------

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

function TickerHeader({ active }: { active: boolean }) {
  const [displayText, setDisplayText] = useState("Your Thinking Assistant");
  const [isTask, setIsTask] = useState(false);
  const [animClass, setAnimClass] = useState("");
  const idxRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!active) {
      runningRef.current = false;
      setAnimClass("ticker-exit");
      const t = window.setTimeout(() => {
        setDisplayText("Kautilya is ready");
        setIsTask(false);
        setAnimClass("ticker-enter");
      }, 360);
      return () => window.clearTimeout(t);
    }

    runningRef.current = true;
    idxRef.current = 0;
    let cancelled = false;
    const timers: number[] = [];

    const tick = () => {
      if (cancelled || !runningRef.current) return;
      const current = TICKER_SEQUENCE[idxRef.current];
      const delay = current.isTask ? 1400 : 2600;
      const t1 = window.setTimeout(() => {
        if (cancelled) return;
        setAnimClass("ticker-exit");
        const t2 = window.setTimeout(() => {
          if (cancelled) return;
          idxRef.current = (idxRef.current + 1) % TICKER_SEQUENCE.length;
          const next = TICKER_SEQUENCE[idxRef.current];
          setDisplayText(next.text);
          setIsTask(next.isTask);
          setAnimClass("ticker-enter");
          const t3 = window.setTimeout(() => {
            if (cancelled) return;
            setAnimClass("");
            tick();
          }, 400);
          timers.push(t3);
        }, 360);
        timers.push(t2);
      }, delay);
      timers.push(t1);
    };

    setAnimClass("ticker-exit");
    const t0 = window.setTimeout(() => {
      const first = TICKER_SEQUENCE[0];
      setDisplayText(first.text);
      setIsTask(first.isTask);
      setAnimClass("ticker-enter");
      const t00 = window.setTimeout(() => { setAnimClass(""); tick(); }, 400);
      timers.push(t00);
    }, 360);
    timers.push(t0);

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [active]);

  return (
    <div className="flex items-center gap-1.5 flex-1 justify-center">
      <div className="h-5 overflow-hidden flex items-center" style={{ perspective: "300px" }}>
        <span className={`whitespace-nowrap block ${isTask ? "text-xs text-muted-foreground" : "text-sm font-medium text-foreground"} ${animClass}`}>
          {displayText}
        </span>
      </div>
      <div className="flex gap-[3px] items-center">
        {[0, 0.2, 0.4].map((delay) => (
          <span key={delay} className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40"
            style={{ animation: active ? `ticker-blink 1.2s ease-in-out ${delay}s infinite` : "none", opacity: active ? 1 : 0 }} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kautilya cards
// ---------------------------------------------------------------------------

const HEADING = 'var(--foreground)';
const ITEM_TEXT = 'rgba(230,218,195,0.95)';
const DIVIDER = 'rgba(201,184,150,0.45)';

function KautilyaCard({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: HEADING }}>
        {title}
      </p>
      <div style={{ height: 2, background: DIVIDER }} />
      {items.length === 0 ? (
        <p className="text-xs italic" style={{ color: HEADING, opacity: 0.5 }}>{emptyText}</p>
      ) : (
        <div className="space-y-2 pt-0.5">
          {items.map((item, i) => (
            <p key={i} className="leading-relaxed" style={{ color: ITEM_TEXT, fontSize: '13px' }}>
              · {item}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function KautilyaSkeleton() {
  return (
    <div className="space-y-5">
      {[1, 2, 3].map(i => (
        <div key={i} className="space-y-2">
          <div className="h-2 w-16 rounded-full mx-auto animate-pulse" style={{ background: DIVIDER }} />
          <div style={{ height: 2, background: DIVIDER }} />
          {[85, 70, 78].map((w, j) => (
            <div key={j} className="h-2 rounded-full animate-pulse" style={{ background: DIVIDER, width: `${w}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function KautilyaCards({ result, loading }: { result: KautilyaResult | null; loading: boolean }) {
  if (loading && !result) return <KautilyaSkeleton />;

  return (
    <div className="space-y-10">
      <KautilyaCard title="Suggestions" items={result?.suggestions ?? []} emptyText="Keep writing to get suggestions." />
      <KautilyaCard title="Biases" items={result?.biases ?? []} emptyText="Biases will appear as you write." />
      <KautilyaCard title="Think About" items={result?.thinkAbout ?? []} emptyText="Angles to consider will show here." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision Output insight components (kept from original)
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
          <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 45 45)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
          <text x="45" y="50" textAnchor="middle" style={{ fontSize: "15px", fontWeight: 600, fill: "currentColor" }}>{pct}%</text>
        </svg>
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{subLabel}</p>
        </div>
      </div>
    </div>
  );
}

function BulletList({ title, items, emptyText, icon }: { title: string; items: string[]; emptyText: string; icon?: "warning" | "bullet" }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 italic">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 flex gap-2 leading-snug">
              {icon === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> : <span className="text-accent shrink-0 mt-0.5">•</span>}
              <span className="line-clamp-2">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DecisionOutputInsights({ extractionSchema, pressureTestState }: { extractionSchema: Record<string, unknown> | null | undefined; pressureTestState: PressureTestState | null | undefined }) {
  const confidence = (extractionSchema?.confidence as Record<string, number> | undefined)?.overall_confidence ?? 0;
  const hiddenDeps = (extractionSchema?.hidden_deps as string[] | undefined) ?? [];
  const synthesis = pressureTestState?.summary as Record<string, unknown> | null | undefined;
  const whatBelieved = (synthesis?.what_founder_believed as string[] | undefined) ?? [];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto scroll-container">
      <ConfidenceGauge value={confidence} />
      <div className="border-t border-accent/60" />
      <BulletList title="Pressure Test Synthesis" items={whatBelieved.slice(0, 3)} emptyText="Complete pressure test to see synthesis." />
      <div className="border-t border-accent/60" />
      <BulletList title="Hidden Dependencies" items={hiddenDeps.slice(0, 3)} emptyText="No hidden dependencies detected." icon="warning" />
    </div>
  );
}

function FailureAnalysisInsights({ insights }: { insights: FailureInsights }) {
  const items = [
    { label: "Likely Root Cause", value: insights.likelyRootCause },
    { label: "Cognitive Bias", value: insights.cognitiveBias },
    { label: "Missed Variable", value: insights.missedVariable },
    { label: "Recommendation", value: insights.recommendation },
  ].filter(i => i.value);

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RightPanel({
  view,
  threadId,
  isCollapsed,
  onToggleCollapse,
  pressureTestState,
  extractionSchema,
  clarifyDraft,
  failureInsights,
  pressureTestAnswer = "",
  failureRawInput = "",
}: RightPanelProps) {
  const hasThread = Boolean(threadId);

  // Derive kautilya input text based on current view
  const kautilyaText = (() => {
    if (view === "clarify" && clarifyDraft) {
      return [
        clarifyDraft.coreProblem,
        clarifyDraft.desiredOutcome,
        clarifyDraft.context,
        ...(clarifyDraft.constraints ?? []),
        ...(clarifyDraft.assumptions ?? []),
      ].filter(Boolean).join(" ");
    }
    if (view === "pressure-test") return pressureTestAnswer;
    if (view === "failure-analysis") return failureRawInput;
    return "";
  })();

  const kautilyaSource = view === "clarify" ? "clarify draft"
    : view === "pressure-test" ? "pressure test"
    : "failure analysis";

  const showKautilya = hasThread && (view === "clarify" || view === "pressure-test" || view === "failure-analysis");

  const { result, loading } = useKautilya(showKautilya ? kautilyaText : "", kautilyaSource);


  if (isCollapsed) {
    return (
      <aside className="w-10 h-full flex flex-col items-center pt-4">
        <button onClick={onToggleCollapse} className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-card">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[330px] h-full bg-card rounded-2xl border border-border/50 p-5 relative flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onToggleCollapse} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        {hasThread && <TickerHeader active={loading} />}
      </div>

      {/* No thread selected */}
      {!hasThread && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground/40 text-sm text-center italic">Start or select a decision to see insights</p>
        </div>
      )}

      {/* Kautilya cards — clarify, pressure-test, failure-analysis */}
      {showKautilya && (
        <div className="flex-1 overflow-y-auto scroll-container mt-8">
          {kautilyaText.trim().length < 20 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(201,184,150,0.1)', border: '1px solid rgba(201,184,150,0.2)' }}>
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-xs text-muted-foreground/60 italic">
                {view === "clarify" ? "Start filling in the form for Kautilya to analyse your thinking."
                  : view === "pressure-test" ? "Write your answer and Kautilya will analyse it."
                  : "Describe what happened and Kautilya will analyse your thinking."}
              </p>
            </div>
          ) : (
            <KautilyaCards result={result} loading={loading} />
          )}
        </div>
      )}

      {/* Decision output view */}
      {hasThread && view === "decision-output" && (
        <DecisionOutputInsights extractionSchema={extractionSchema} pressureTestState={pressureTestState} />
      )}

      {/* Failure analysis results view (after analysis is done) */}
      {hasThread && view === "failure-analysis" && failureInsights && !showKautilya && (
        <FailureAnalysisInsights insights={failureInsights} />
      )}

      {/* Home / simulation / other views — empty state with thread */}
      {hasThread && !showKautilya && view !== "decision-output" && view !== "failure-analysis" && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground/40 text-sm text-center italic">Insights will appear when you open a decision stage.</p>
        </div>
      )}
    </aside>
  );
}
