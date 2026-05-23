import { NextRequest, NextResponse } from "next/server";
import {
  getThreadById,
  runSimulation,
} from "@/lib/server/thread-store";
import { isCoreBackendProxyEnabled, proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ threadId: string }>;
}

const BACKEND_URL = process.env.CORE_BACKEND_URL?.replace(/\/$/, "") ?? "";
const BACKEND_TIMEOUT_MS = 25_000;

async function callBackend(path: string, body: unknown, accessToken?: string): Promise<unknown | null> {
  try {
    const headers: HeadersInit = { "content-type": "application/json" };
    if (accessToken) headers["authorization"] = `Bearer ${accessToken}`;
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchBackendSimulationState(threadId: string, accessToken?: string): Promise<Record<string, unknown> | null> {
  if (!BACKEND_URL) return null;

  try {
    const headers: HeadersInit = {};
    if (accessToken) headers["authorization"] = `Bearer ${accessToken}`;
    const res = await fetch(`${BACKEND_URL}/api/v1/threads/${threadId}/simulation`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request,
    path: `/api/v1/threads/${threadId}/simulation`,
    method: "GET",
  });
  if (proxied) return proxied;

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
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    const backendState = await fetchBackendSimulationState(threadId, accessToken);
    const extractionSchema = (backendState?.extractionSchema as Record<string, unknown> | null) ?? null;

    if (extractionSchema) {
      // Step 1: Monte Carlo distributions + sensitivity
      const simResult = await callBackend("/api/v1/simulate", {
        extraction_schema: extractionSchema,
        user_values: userValues,
      }, accessToken) as Record<string, unknown> | null;

      if (simResult?.options) {
        // Step 2: LLM explanation — pass thread_id so backend can inject session context
        const scored = await callBackend("/api/v1/score", {
          extraction_schema: extractionSchema,
          simulation: simResult,
          user_values: userValues,
          thread_id: threadId,
        }, accessToken) as Record<string, unknown> | null;

        return NextResponse.json({ run: scored ?? simResult }, { status: 201 });
      }
    }
  }

  // Fallback: legacy hardcoded simulation (no extractionSchema or backend unavailable)
  const thread = await getThreadById(threadId).catch(() => null);
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
