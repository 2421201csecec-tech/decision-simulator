"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronRight, ChevronLeft, MoreHorizontal } from "lucide-react";
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

export function RightPanel({
  view,
  threadId,
  isCollapsed,
  onToggleCollapse,
  pressureTestState,
  extractionSchema,
  clarifyDraft,
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
    <aside className="w-80 h-full bg-card rounded-2xl border border-border/50 p-5 relative flex flex-col">
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

      {/* Four insight blocks — always visible when a thread is active */}
      {hasThread && (
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
