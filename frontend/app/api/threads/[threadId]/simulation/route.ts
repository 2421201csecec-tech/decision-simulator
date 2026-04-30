import { NextRequest, NextResponse } from "next/server";
import {
  getLatestSimulation,
  getThreadById,
  runExtractionSimulation,
  runSimulation,
} from "@/lib/server/thread-store";
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

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;
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

  if (BACKEND_URL) {
    const thread = await getThreadById(threadId);
    const extractionSchema = thread?.extractionSchema;

    if (extractionSchema) {
      // Step 1: Monte Carlo distributions + sensitivity
      const simResult = await callBackend("/api/v1/simulate", {
        extraction_schema: extractionSchema,
        user_values: userValues,
      }) as Record<string, unknown> | null;

      if (simResult?.options) {
        // Step 2: LLM explanation
        const scored = await callBackend("/api/v1/score", {
          extraction_schema: extractionSchema,
          simulation: simResult,
          user_values: userValues,
        }) as Record<string, unknown> | null;

        const fullResult = scored ?? simResult;

        const run = await runExtractionSimulation(threadId, {
          options: fullResult.options as never,
          confidence: fullResult.confidence as number | undefined,
          winner_id: fullResult.winner_id as string | null | undefined,
          key_variable_id: fullResult.key_variable_id as string | null | undefined,
          explanation: fullResult.explanation as never,
        });

        if (!run) {
          return NextResponse.json({ message: "Thread not found" }, { status: 404 });
        }
        return NextResponse.json({ run }, { status: 201 });
      }
    }
  }

  // Fallback: legacy hardcoded simulation (no extractionSchema or backend unavailable)
  const thread = await getThreadById(threadId);
  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  const draft = thread.clarifyDraft;
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
