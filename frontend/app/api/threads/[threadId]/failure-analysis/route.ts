import { NextRequest, NextResponse } from "next/server";
import { getFailureAnalysis, saveFailureAnalysis } from "@/lib/server/thread-store";
import { errorResponse, failureAnalysisSchema } from "@/lib/server/validation";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/failure-analysis`,
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const failureAnalysis = await getFailureAnalysis(threadId);

  if (!failureAnalysis) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ failureAnalysis });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: request.clone(),
    path: `/api/v1/threads/${threadId}/failure-analysis`,
    method: "PUT",
  });
  if (proxied) {
    return proxied;
  }

  const body = (await request.json().catch(() => null)) as unknown;

  if (!body) {
    return errorResponse("Invalid payload", 400);
  }

  const parsed = failureAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const saved = await saveFailureAnalysis(threadId, {
    whatHappened: parsed.data.whatHappened,
    observations: parsed.data.observations,
    failedAssumptions: parsed.data.failedAssumptions,
    rootCause: parsed.data.rootCause,
  });

  if (!saved) {
    return errorResponse("Thread not found", 404);
  }

  return NextResponse.json({ failureAnalysis: saved });
}
