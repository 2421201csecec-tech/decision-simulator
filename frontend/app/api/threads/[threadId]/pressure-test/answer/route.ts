import { NextRequest, NextResponse } from "next/server";
import { getPressureTest, submitPressureAnswer } from "@/lib/server/thread-store";
import { errorResponse, pressureAnswerSchema } from "@/lib/server/validation";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const body = (await request.json().catch(() => null)) as unknown;

  const parsed = pressureAnswerSchema.safeParse(body);
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

  const pressureTest = await submitPressureAnswer(threadId, parsed.data.scenarioId, parsed.data.answer);
  if (!pressureTest) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ pressureTest });
}
