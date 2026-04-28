import { NextRequest, NextResponse } from "next/server";
import {
  generatePressureTest,
  getPressureTest,
  saveExtractionSchema,
  type ClarifyDraft,
  type PressureScenario,
} from "@/lib/server/thread-store";
import { getThreadById } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/pressure-test`,
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const pressureTest = await getPressureTest(threadId);

  if (!pressureTest) {
    return NextResponse.json({ message: "Pressure test not found" }, { status: 404 });
  }

  return NextResponse.json({ pressureTest });
}

function composeDraftInput(draft: ClarifyDraft): string {
  const parts = [`Decision: ${draft.title}`];
  if (draft.coreProblem) parts.push(`Problem: ${draft.coreProblem}`);
  if (draft.context) parts.push(`Context: ${draft.context}`);
  if (draft.constraints?.length) parts.push(`Constraints: ${draft.constraints.join("; ")}`);
  if (draft.assumptions?.length) parts.push(`My assumptions: ${draft.assumptions.join("; ")}`);
  return parts.join("\n");
}

export async function POST(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/pressure-test`,
    method: "POST",
  });
  if (proxied) {
    return proxied;
  }

  const thread = await getThreadById(threadId);
  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  const backendUrl = process.env.CORE_BACKEND_URL?.replace(/\/$/, "");
  let aiScenarios: PressureScenario[] | undefined;

  if (thread.clarifyDraft && backendUrl) {
    let extractionSchema = thread.extractionSchema;

    if (!extractionSchema) {
      try {
        const res = await fetch(`${backendUrl}/api/v1/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_input: composeDraftInput(thread.clarifyDraft) }),
          cache: "no-store",
        });
        if (res.ok) {
          const schema = await res.json();
          if (schema.status !== "clarification_needed") {
            extractionSchema = schema as Record<string, unknown>;
            await saveExtractionSchema(threadId, extractionSchema);
          }
        }
      } catch {
        // fall through to clarify draft fallback
      }
    }

    const source = extractionSchema ?? thread.clarifyDraft;
    try {
      const res = await fetch(`${backendUrl}/api/v1/pressure-test/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const raw: unknown[] = json.scenarios ?? [];
        if (raw.length > 0) {
          aiScenarios = (raw as Record<string, unknown>[]).map((s, i) => ({
            id: i + 1,
            scenario: String(s.scenario ?? ""),
            question: String(s.question ?? ""),
            thinkAbout: Array.isArray(s.thinkAbout) ? (s.thinkAbout as string[]) : [],
          }));
        }
      }
    } catch {
      // fall through to default scenarios
    }
  }

  const result = await generatePressureTest(threadId, aiScenarios);
  if (!result) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ pressureTest: result.pressureTest });
}
