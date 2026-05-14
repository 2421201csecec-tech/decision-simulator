"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, XCircle, MinusCircle, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchFailureAnalysis,
  fetchDecisionOutput,
  saveFailureAnalysis,
  type AssumptionGap,
  type FailureLesson,
} from "@/lib/api/threads";

interface DiagnoseFailureProps {
  threadId?: string | null;
  failedDecision: string;
  onBack: () => void;
  onRebuild: (context: { failedTitle: string; failedLessons: string[] }) => void;
  onAnalysisComplete?: (data: { likelyRootCause: string; cognitiveBias: string; missedVariable: string; recommendation: string; }) => void;
}

type Step = 0 | 1 | 2 | 3 | 4 | "analyzing" | 5 | 6;

const FAILURE_TYPE_LABELS: Record<string, string> = {
  assumption: "Assumption Failure",
  execution: "Execution Failure",
  external_shock: "External Shock",
  framing: "Framing Failure",
};

const FAILURE_TYPE_DESC: Record<string, string> = {
  assumption: "A belief about the world was wrong",
  execution: "The plan was sound — delivery broke it",
  external_shock: "An unforeseeable external change altered conditions",
  framing: "The right problem was solved, but it was the wrong problem",
};

function VerdictIcon({ verdict }: { verdict: AssumptionGap["verdict"] }) {
  if (verdict === "broke") return <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />;
  if (verdict === "partial") return <MinusCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />;
  return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
}

function VerdictBadge({ verdict }: { verdict: AssumptionGap["verdict"] }) {
  const map = {
    broke: "text-destructive bg-destructive/10",
    partial: "text-yellow-600 bg-yellow-500/10",
    held: "text-emerald-600 bg-emerald-500/10",
  };
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded", map[verdict])}>
      {verdict === "broke" ? "BROKE" : verdict === "partial" ? "PARTIAL" : "HELD"}
    </span>
  );
}

export function DiagnoseFailure({ threadId, failedDecision, onBack, onRebuild, onAnalysisComplete }: DiagnoseFailureProps) {
  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanTitle, setCleanTitle] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);

  const [whatDid, setWhatDid] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [biggestSurprise, setBiggestSurprise] = useState("");

  const [failureType, setFailureType] = useState<string | null>(null);
  const [assumptionGaps, setAssumptionGaps] = useState<AssumptionGap[]>([]);
  const [likelyRootCause, setLikelyRootCause] = useState("");
  const [cognitiveBias, setCognitiveBias] = useState("");
  const [missedVariable, setMissedVariable] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [lessons, setLessons] = useState<FailureLesson[]>([]);
  const [newLesson, setNewLesson] = useState("");

  useEffect(() => {
    if (!threadId) { setLoading(false); return; }
    fetchDecisionOutput(threadId)
      .then((data) => { if (data.decisionTitle) setCleanTitle(data.decisionTitle); })
      .catch(() => {});
    fetchFailureAnalysis(threadId)
      .then((data) => {
        setSnapshot((data.snapshot as Record<string, unknown>) || null);
        if (data.whatHappened) setWhatHappened(data.whatHappened);
        if (data.failureType) {
          setFailureType(data.failureType);
          setAssumptionGaps(data.assumptionGaps || []);
          setLikelyRootCause(data.likelyRootCause || "");
          setCognitiveBias(data.cognitiveBias || "");
          setMissedVariable(data.missedVariable || "");
          setRecommendation(data.recommendation || "");
          setLessons(data.lessons || []);
          setStep(5);
          if (data.likelyRootCause && onAnalysisComplete) {
            onAnalysisComplete({
              likelyRootCause: data.likelyRootCause,
              cognitiveBias: data.cognitiveBias || "",
              missedVariable: data.missedVariable || "",
              recommendation: data.recommendation || "",
            });
          }
        }
      })
      .catch(() => setError("Unable to load failure analysis."))
      .finally(() => setLoading(false));
  }, [threadId]);

  const handleSubmitIntake = async () => {
    if (!threadId) return;
    setStep("analyzing");
    setError(null);
    try {
      const data = await saveFailureAnalysis(threadId, {
        whatHappened,
        expectedOutcome,
        whatDid,
        biggestSurprise,
        observations: [],
        failedAssumptions: [],
        rootCause: "",
      });
      setFailureType(data.failureType || null);
      setAssumptionGaps(data.assumptionGaps || []);
      setLikelyRootCause(data.likelyRootCause || "");
      setCognitiveBias(data.cognitiveBias || "");
      setMissedVariable(data.missedVariable || "");
      setRecommendation(data.recommendation || "");
      setLessons(data.lessons || []);
      setStep(5);
      if (data.likelyRootCause && onAnalysisComplete) {
        onAnalysisComplete({
          likelyRootCause: data.likelyRootCause,
          cognitiveBias: data.cognitiveBias || "",
          missedVariable: data.missedVariable || "",
          recommendation: data.recommendation || "",
        });
      }
    } catch {
      setError("Analysis failed. You can go back and try again.");
      setStep(4);
    }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }

  // Step 0 — Snapshot
  if (step === 0) {
    const snapshotAssumptions = (snapshot?.assumptions as string[]) || [];
    const snapshotConstraints = (snapshot?.constraints as string[]) || [];
    return (
      <div className="h-full flex flex-col overflow-hidden px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onBack} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/30">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-semibold text-foreground">Diagnose Failure</h1>
        </div>

        <div className="flex-1 overflow-y-auto scroll-container space-y-6">
          <p className="text-sm text-muted-foreground">
            Review the original decision first. This is the baseline we'll compare reality against — assumption by assumption.
          </p>

          <div className="rounded-2xl border border-border/50 bg-secondary/30 p-6 space-y-5">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Decision</p>
              <p className="text-lg font-semibold text-foreground">{cleanTitle || (snapshot?.title as string) || failedDecision}</p>
            </div>
            {!!snapshot?.coreProblem && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Core Problem</p>
                <p className="text-sm text-foreground/80">{String(snapshot.coreProblem)}</p>
              </div>
            )}
            {!!snapshot?.desiredOutcome && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Desired Outcome</p>
                <p className="text-sm text-foreground/80">{String(snapshot.desiredOutcome)}</p>
              </div>
            )}
            {snapshotAssumptions.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Assumptions Made</p>
                <ul className="space-y-1.5">
                  {snapshotAssumptions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground/80">
                      <span className="text-accent shrink-0 mt-0.5">•</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {snapshotConstraints.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Constraints</p>
                <ul className="space-y-1.5">
                  {snapshotConstraints.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground/80">
                      <span className="text-muted-foreground/50 shrink-0">—</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="pt-6">
          <button
            onClick={() => setStep(1)}
            className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
          >
            Begin Diagnosis
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Steps 1–4 — One question at a time
  if (step === 1 || step === 2 || step === 3 || step === 4) {
    const stepNum = step as 1 | 2 | 3 | 4;
    const questions = {
      1: { label: "What did you actually do after this decision?", value: whatDid, setter: setWhatDid },
      2: { label: "What outcome did you expect, and by when?", value: expectedOutcome, setter: setExpectedOutcome },
      3: { label: "What outcome did you actually get?", value: whatHappened, setter: setWhatHappened },
      4: { label: "What surprised you most about the result?", value: biggestSurprise, setter: setBiggestSurprise },
    };
    const current = questions[stepNum];

    return (
      <div className="h-full flex flex-col overflow-hidden px-8 py-8">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setStep((stepNum - 1) as Step)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/30">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">{stepNum} / 4</span>
        </div>

        <div className="h-0.5 bg-border/30 rounded-full mb-8">
          <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${(stepNum / 4) * 100}%` }} />
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full space-y-6">
          <label className="text-xl font-medium text-foreground leading-snug">{current.label}</label>
          <textarea
            value={current.value}
            onChange={(e) => current.setter(e.target.value)}
            autoFocus
            placeholder="Write your answer here…"
            className="w-full px-4 py-3 bg-secondary border border-border/50 rounded-xl text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all resize-none"
            rows={6}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="pt-6">
          <button
            onClick={() => {
              if (stepNum < 4) setStep((stepNum + 1) as Step);
              else handleSubmitIntake();
            }}
            disabled={!current.value.trim()}
            className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {stepNum === 4 ? "Run Analysis" : "Next"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Analyzing
  if (step === "analyzing") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Analyzing your failure against the original decision…</p>
        <p className="text-xs text-muted-foreground/50">Comparing assumption by assumption</p>
      </div>
    );
  }

  // Step 5 — Gap Analysis
  if (step === 5) {
    return (
      <div className="h-full flex flex-col overflow-hidden px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onBack} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/30">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-semibold text-foreground">Analysis</h1>
        </div>

        <div className="flex-1 overflow-y-auto scroll-container space-y-6">
          {failureType && (
            <div className="rounded-2xl border border-border/50 bg-secondary/30 p-5 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Failure Type</p>
              <p className="text-base font-semibold text-foreground">{FAILURE_TYPE_LABELS[failureType] || failureType}</p>
              <p className="text-sm text-muted-foreground">{FAILURE_TYPE_DESC[failureType] || ""}</p>
            </div>
          )}

          {assumptionGaps.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Assumption Gaps</p>
              <ul className="space-y-3">
                {assumptionGaps.map((gap, i) => (
                  <li key={i} className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <VerdictIcon verdict={gap.verdict} />
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <VerdictBadge verdict={gap.verdict} />
                          <span className="text-sm text-foreground font-medium leading-snug">{gap.text}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{gap.why}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(likelyRootCause || cognitiveBias || missedVariable || recommendation) && (
            <div className="rounded-2xl border border-border/50 bg-secondary/30 p-5 space-y-4">
              {likelyRootCause && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Root Cause</p>
                  <p className="text-sm text-foreground/80">{likelyRootCause}</p>
                </div>
              )}
              {cognitiveBias && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Cognitive Bias</p>
                  <p className="text-sm text-foreground/80">{cognitiveBias}</p>
                </div>
              )}
              {missedVariable && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Missed Variable</p>
                  <p className="text-sm text-foreground/80">{missedVariable}</p>
                </div>
              )}
              {recommendation && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Recommendation</p>
                  <p className="text-sm text-foreground/80">{recommendation}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-6">
          <button
            onClick={() => setStep(6)}
            className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
          >
            See Extracted Lessons
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Step 6 — Lessons
  return (
    <div className="h-full flex flex-col overflow-hidden px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => setStep(5)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/30">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-semibold text-foreground">Lessons</h1>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container space-y-4">
        <p className="text-sm text-muted-foreground">
          These lessons will shape your next pressure test. Edit or remove anything that doesn't ring true.
        </p>

        <ul className="space-y-2">
          {lessons.map((lesson, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card p-4">
              <span className="text-accent shrink-0 mt-0.5">•</span>
              <span className="text-sm text-foreground/80 flex-1 leading-snug">{lesson.statement}</span>
              <button
                onClick={() => setLessons(lessons.filter((_, idx) => idx !== i))}
                className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>

        {lessons.length === 0 && (
          <p className="text-xs text-muted-foreground/50 italic">No lessons extracted. Add one below.</p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newLesson}
            onChange={(e) => setNewLesson(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLesson.trim()) {
                setLessons([...lessons, { statement: newLesson.trim(), patternType: "user_added", isNew: true }]);
                setNewLesson("");
              }
            }}
            placeholder="Add a lesson…"
            className="flex-1 px-3 py-2 bg-secondary border border-border/50 rounded-lg text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={() => {
              if (newLesson.trim()) {
                setLessons([...lessons, { statement: newLesson.trim(), patternType: "user_added", isNew: true }]);
                setNewLesson("");
              }
            }}
            className="px-3 py-2 text-accent hover:text-accent/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="pt-6">
        <button
          onClick={() => onRebuild({ failedTitle: failedDecision, failedLessons: lessons.map((l) => l.statement) })}
          className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
        >
          Confirm & Rebuild Decision
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
