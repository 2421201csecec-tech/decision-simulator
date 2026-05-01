import { NextRequest, NextResponse } from "next/server";
import {
  getThreadById,
  runExtractionSimulation,
  runSimulation,
} from "@/lib/server/thread-store";
import { isCoreBackendProxyEnabled } from "@/lib/server/core-backend-proxy";
interface Params {
  params: Promise<{ threadId: string }>;
}

const BACKEND_URL = process.env.CORE_BACKEND_URL?.replace(/\/$/, "") ?? "";

async function callBackend(path: string, body: unknown): Promise<unknown | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchBackendSimulationState(threadId: string): Promise<Record<string, unknown> | null> {
  if (!BACKEND_URL) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/threads/${threadId}/simulation`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  if (BACKEND_URL && isCoreBackendProxyEnabled()) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/threads/${threadId}/simulation`, { cache: "no-store" });
      if (res.ok) return NextResponse.json(await res.json());
    } catch {
      // fall through to local store
    }
  }

  const thread = await getThreadById(threadId);
  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }
  const run = thread.simulationRuns?.[0] ?? null;
  return NextResponse.json({ run, extractionSchema: thread.extractionSchema ?? null });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const userValues = (body?.user_values ?? {}) as Record<string, number>;

  if (BACKEND_URL && isCoreBackendProxyEnabled()) {
    const thread = await getThreadById(threadId);
    let extractionSchema = thread?.extractionSchema ?? null;

    if (!extractionSchema) {
      const backendState = await fetchBackendSimulationState(threadId);
      extractionSchema = (backendState?.extractionSchema as Record<string, unknown> | null) ?? null;
    }

    if (extractionSchema) {
      // Step 1: Monte Carlo distributions + sensitivity
      const simResult = await callBackend("/api/v1/simulate", {
        extraction_schema: extractionSchema,
        user_values: userValues,
      }) as Record<string, unknown> | null;

      if (simResult?.options) {
        // Step 2: LLM explanation — pass thread_id so backend can inject session context
        const scored = await callBackend("/api/v1/score", {
          extraction_schema: extractionSchema,
          simulation: simResult,
          user_values: userValues,
          thread_id: threadId,
        }) as Record<string, unknown> | null;

        const fullResult = scored ?? simResult;

        const run = await runExtractionSimulation(threadId, {
          options: fullResult.options as never,
          confidence: fullResult.confidence as number | undefined,
          winner_id: fullResult.winner_id as string | null | undefined,
          key_variable_id: fullResult.key_variable_id as string | null | undefined,
          explanation: fullResult.explanation as never,
        });

        if (run) {
          return NextResponse.json({ run }, { status: 201 });
        }

        return NextResponse.json({ run: fullResult }, { status: 201 });
      }
    }
  }

  // Fallback: legacy hardcoded simulation (no extractionSchema or backend unavailable)
  const thread = await getThreadById(threadId);
  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  const dummyVariables = {
    price: "Rs 1,999",
    targetMarket: "Early Adopters" as const,
    marketingSpend: "Rs 50,000",
    timeHorizon: "3 Months" as const,
  };

  const run = await runSimulation(threadId, dummyVariables);
  if (!run) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ run }, { status: 201 });
}
