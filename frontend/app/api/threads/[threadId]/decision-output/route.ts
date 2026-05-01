import { NextRequest, NextResponse } from "next/server";
import { getDecisionOutputData, getThreadById, saveDecisionOutput, type DecisionOutputData } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend, isCoreBackendProxyEnabled } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/decision-output`,
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const thread = await getThreadById(threadId);
  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  if (thread.decisionOutput) {
    return NextResponse.json({ output: thread.decisionOutput });
  }

  const backendUrl = process.env.CORE_BACKEND_URL?.replace(/\/$/, "");
  if (backendUrl && isCoreBackendProxyEnabled() && thread.extractionSchema && thread.pressureTest?.completed) {
    try {
      const res = await fetch(`${backendUrl}/api/v1/decision-output/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction_schema: thread.extractionSchema,
          pressure_test: thread.pressureTest,
        }),
        cache: "no-store",
      });
      if (res.ok) {
        const raw = await res.json();
        const output: DecisionOutputData = {
          decisionTitle: thread.clarifyDraft?.title?.trim() || thread.title,
          finalDecision: String(raw.finalDecision ?? ""),
          keyReasons: Array.isArray(raw.keyReasons) ? raw.keyReasons : [],
          keyRisks: Array.isArray(raw.keyRisks) ? raw.keyRisks : [],
          assumptions: Array.isArray(raw.assumptions) ? raw.assumptions : [],
          decisionStrength: typeof raw.decisionStrength === "number" ? raw.decisionStrength : 50,
          strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
          weakPoints: Array.isArray(raw.weakPoints) ? raw.weakPoints : [],
          suggestedExperiment: String(raw.suggestedExperiment ?? ""),
        };
        await saveDecisionOutput(threadId, output);
        return NextResponse.json({ output });
      }
    } catch {
      // fall through to algorithmic fallback
    }
  }

  const output = await getDecisionOutputData(threadId);
  if (!output) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ output });
}
