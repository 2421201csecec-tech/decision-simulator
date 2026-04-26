
import { NextRequest, NextResponse } from "next/server";
import { getPressureTest, skipPressureScenario } from "@/lib/server/thread-store";
import { errorResponse, pressureSkipSchema } from "@/lib/server/validation";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: request.clone(),
    path: `/api/v1/threads/${threadId}/pressure-test/skip`,
    method: "POST",
  });
  if (proxied) {
    return proxied;
  }

  const body = (await request.json().catch(() => null)) as unknown;

  const parsed = pressureSkipSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const existing = await getPressureTest(threadId);
  if (!existing) {
    return errorResponse("Pressure test not found", 404);
  }

  const currentScenario = existing.scenarios[existing.currentIndex];
  if (!currentScenario) {
    return errorResponse("Pressure test is already completed", 409);
  }

  if (currentScenario.id !== parsed.data.scenarioId) {
    return errorResponse("Scenario does not match current pressure-test step", 409);
  }

  const pressureTest = await skipPressureScenario(threadId, parsed.data.scenarioId);
  if (!pressureTest) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ pressureTest });
}
