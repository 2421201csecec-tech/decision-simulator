"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { LeftPanel } from "@/components/dashboard/left-panel";
import { CenterPanel } from "@/components/dashboard/center-panel";
import { RightPanel } from "@/components/dashboard/right-panel";
import { cn } from "@/lib/utils";
import {
  analyzeDraft,
  createThread,
  fetchClarifyDraft,
  fetchGroupedThreads,
  fetchPressureTest,
  fetchSimulationState,
  rebuildDecision,
  saveClarifyDraft,
  triggerExtraction,
  type ClarifyDraft,
  type DraftInsights,
  type GroupedThreads,
  type PressureTestState,
  type ThreadRecord,
} from "@/lib/api/threads";

type ViewState = "home" | "clarify" | "pressure-test" | "decision-output" | "simulation" | "failure-analysis" | "decision-card";

interface DecisionData {
  title: string;
  coreProblem: string;
  desiredOutcome: string;
  context: string;
  constraints: string[];
  assumptions: string[];
}

export default function Dashboard() {
  const [view, setView] = useState<ViewState>("home");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [decisionData, setDecisionData] = useState<DecisionData | null>(null);
  const [selectedFailedDecision, setSelectedFailedDecision] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [groupedThreads, setGroupedThreads] = useState<GroupedThreads>({
    active: [],
    revisions: [],
    failureAnalysis: [],
    history: [],
  });
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [reentryContext, setReentryContext] = useState<{ failedTitle: string; failedLessons: string[] } | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [clarifyInsights, setClarifyInsights] = useState<DraftInsights | null>(null);
  const [isAnalyzingDraft, setIsAnalyzingDraft] = useState(false);
  const [pressureTestState, setPressureTestState] = useState<PressureTestState | null>(null);
  const [extractionSchema, setExtractionSchema] = useState<Record<string, unknown> | null>(null);
  const [failureInsights, setFailureInsights] = useState<{ likelyRootCause: string; cognitiveBias: string; missedVariable: string; recommendation: string; } | null>(null);
  const autosaveResetTimerRef = useRef<number | null>(null);
  const lastAutosavedByThreadRef = useRef<Record<string, string>>({});

  const refreshGroupedThreads = useCallback(async () => {
    try {
      const data = await fetchGroupedThreads();
      setGroupedThreads(data);
    } catch (error) {
      console.error("Failed to load threads", error);
      setUiError(error instanceof Error ? error.message : "Failed to load threads.");
    }
  }, []);

  useEffect(() => {
    refreshGroupedThreads();
  }, [refreshGroupedThreads]);

  // Reset and hydrate insight state on thread switch
  useEffect(() => {
    setPressureTestState(null);
    setExtractionSchema(null);
    if (!selectedThreadId) return;
    fetchSimulationState(selectedThreadId).then(({ extractionSchema: schema }) => {
      setExtractionSchema(schema);
    }).catch(() => {});
    fetchPressureTest(selectedThreadId).then((state) => {
      if (state) setPressureTestState(state);
    }).catch(() => {});
  }, [selectedThreadId]);

  useEffect(() => {
    return () => {
      if (autosaveResetTimerRef.current) {
        window.clearTimeout(autosaveResetTimerRef.current);
      }
    };
  }, []);

  const handleStartDecision = async () => {
    try {
      const thread = await createThread();
      setUiError(null);
      setSelectedThreadId(thread.id);
      setDecisionData(thread.clarifyDraft || null);
      setView("clarify");
      await refreshGroupedThreads();
    } catch (error) {
      console.error("Failed to create thread", error);
      setUiError(error instanceof Error ? error.message : "Failed to create thread.");
    }
  };

  const handleBack = () => {
    if (view === "decision-card") {
      setView("decision-output");
      setRightCollapsed(false);
    } else if (view === "simulation") {
      setView("decision-output");
      setRightCollapsed(false);
    } else if (view === "failure-analysis") {
      setView("home");
      setSelectedFailedDecision(null);
    } else if (view === "decision-output") {
      setView("pressure-test");
    } else if (view === "pressure-test") {
      setView("clarify");
    } else {
      setView("home");
    }
  };

  const handleContinue = async (data: DecisionData) => {
    setDecisionData(data);

    if (selectedThreadId) {
      try {
        setUiError(null);
        setAutosaveStatus("saving");
        await saveClarifyDraft(selectedThreadId, data);
        setAutosaveStatus("saved");
        await refreshGroupedThreads();
      } catch (error) {
        console.error("Failed to save clarify draft", error);
        setAutosaveStatus("error");
        setUiError(error instanceof Error ? error.message : "Failed to save clarify draft.");
      }

      // Fire extraction in background — does not block navigation
      const threadId = selectedThreadId;
      triggerExtraction(threadId).then((schema) => {
        if (schema) setExtractionSchema(schema);
      });
    }

    if (view === "clarify") {
      setView("pressure-test");
    }
  };

  const handleAutosaveClarify = useCallback(async (data: DecisionData) => {
    if (!selectedThreadId) return;

    const serialized = JSON.stringify(data);
    if (lastAutosavedByThreadRef.current[selectedThreadId] === serialized) {
      return;
    }

    try {
      setUiError(null);
      setAutosaveStatus("saving");
      await saveClarifyDraft(selectedThreadId, data);
      lastAutosavedByThreadRef.current[selectedThreadId] = serialized;
      setDecisionData(data);
      setAutosaveStatus("saved");

      if (autosaveResetTimerRef.current) {
        window.clearTimeout(autosaveResetTimerRef.current);
      }
      autosaveResetTimerRef.current = window.setTimeout(() => {
        setAutosaveStatus("idle");
      }, 1200);
    } catch (error) {
      console.error("Autosave failed", error);
      setAutosaveStatus("error");
      setUiError(error instanceof Error ? error.message : "Autosave failed.");
    }
  }, [selectedThreadId]);

  const handleDraftChange = useCallback(async (data: DecisionData) => {
    setIsAnalyzingDraft(true);
    const insights = await analyzeDraft({
      title: data.title,
      core_problem: data.coreProblem,
      context: data.context,
      constraints: data.constraints,
      assumptions: data.assumptions,
    });
    setClarifyInsights(insights);
    setIsAnalyzingDraft(false);
  }, []);

  const handleSubmitFinal = useCallback(() => {
    setView("decision-output");
    if (selectedThreadId) {
      // Fetch extraction schema immediately (runs during clarify, may not be in state yet)
      fetchSimulationState(selectedThreadId).then(({ extractionSchema: schema }) => {
        if (schema) setExtractionSchema(schema);
      }).catch(() => {});
      // Synthesis runs as a background task — re-fetch after delay to pick it up
      window.setTimeout(() => {
        fetchPressureTest(selectedThreadId).then((state) => {
          if (state?.summary) setPressureTestState(state);
        }).catch(() => {});
      }, 4000);
    }
  }, [selectedThreadId]);

  const handleRunSimulation = () => {
    setView("simulation");
    setRightCollapsed(true);
  };

  const handleViewDecisionCard = () => {
    setView("decision-card");
    setRightCollapsed(true);
  };

  const handleStartRevision = () => {
    setView("clarify");
  };

  const handleFailureAnalysis = (thread: ThreadRecord) => {
    setUiError(null);
    setSelectedThreadId(thread.id);
    setSelectedFailedDecision(thread.title);
    setView("failure-analysis");
  };

  const handleRebuildDecision = async (context?: { failedTitle: string; failedLessons: string[] }) => {
    if (!selectedThreadId) return;
    const failedThreadId = selectedThreadId;
    const lessons = context?.failedLessons ?? [];

    try {
      setUiError(null);
      const newThread = await rebuildDecision(failedThreadId, lessons);
      setSelectedThreadId(newThread.id);
      setSelectedFailedDecision(null);
      setReentryContext(null);
      setPressureTestState(null);
      setView("pressure-test");
      await refreshGroupedThreads();
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Failed to rebuild decision.");
    }
  };

  const handleLogoClick = () => {
    setView("home");
    setDecisionData(null);
    setSelectedFailedDecision(null);
    setAutosaveStatus("idle");
    setUiError(null);
    setReentryContext(null);
  };

  const handleSelectThread = async (thread: ThreadRecord) => {
    setUiError(null);
    setAutosaveStatus("idle");
    setSelectedThreadId(thread.id);
    setView("clarify");

    try {
      const draft = await fetchClarifyDraft(thread.id);
      setDecisionData((draft as ClarifyDraft) || null);
      if (draft) {
        lastAutosavedByThreadRef.current[thread.id] = JSON.stringify(draft);
      } else {
        delete lastAutosavedByThreadRef.current[thread.id];
      }
    } catch (error) {
      console.error("Failed to load clarify draft", error);
      setDecisionData(null);
      setUiError(error instanceof Error ? error.message : "Failed to load clarify draft.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Top Navigation */}
      <TopNav onLogoClick={handleLogoClick} />

      {/* Main Content Area with 3 Panels */}
      <div className="pt-16 h-screen">
        {uiError ? (
          <div className="px-4 pb-2">
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {uiError}
            </div>
          </div>
        ) : null}
        <div className="h-full p-4 flex gap-4">
          {/* Left Panel - Navigation */}
          <div
            className={cn(
              "transition-all duration-300 ease-in-out",
              leftCollapsed ? "w-10" : "w-72"
            )}
          >
          <LeftPanel
            isCollapsed={leftCollapsed}
            onToggleCollapse={() => setLeftCollapsed(!leftCollapsed)}
            groupedThreads={groupedThreads}
            selectedThreadId={selectedThreadId}
            onSelectThread={handleSelectThread}
            onFailureAnalysis={handleFailureAnalysis}
            onSimulation={(thread) => {
              setSelectedThreadId(thread.id);
              setView("simulation");
              setRightCollapsed(true);
            }}
          />
          </div>

          {/* Center Panel - Main Canvas */}
          <CenterPanel
            view={view}
            selectedThreadId={selectedThreadId}
            onStartDecision={handleStartDecision}
            onBack={handleBack}
            onContinue={handleContinue}
            onAutosaveClarify={handleAutosaveClarify}
            onDraftChange={handleDraftChange}
            autosaveStatus={autosaveStatus}
            onSubmitFinal={handleSubmitFinal}
            onRunSimulation={handleRunSimulation}
            onStartRevision={handleStartRevision}
            onViewDecisionCard={handleViewDecisionCard}
            onRebuildDecision={handleRebuildDecision}
            decisionData={decisionData}
            selectedFailedDecision={selectedFailedDecision}
            onPressureStateChange={setPressureTestState}
            reentryContext={reentryContext}
            onFailureAnalysisComplete={setFailureInsights}
          />

          {/* Right Panel - AI Insights */}
          <div
            className={cn(
              "transition-all duration-300 ease-in-out",
              rightCollapsed ? "w-10" : "w-80"
            )}
          >
            <RightPanel
              view={view}
              threadId={selectedThreadId}
              isCollapsed={rightCollapsed}
              onToggleCollapse={() => setRightCollapsed(!rightCollapsed)}
              onRunSimulation={handleRunSimulation}
              onStartRevision={handleStartRevision}
              clarifyInsights={clarifyInsights}
              isAnalyzingDraft={isAnalyzingDraft}
              pressureTestState={pressureTestState}
              extractionSchema={extractionSchema}
              clarifyDraft={decisionData}
              failureInsights={failureInsights}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
