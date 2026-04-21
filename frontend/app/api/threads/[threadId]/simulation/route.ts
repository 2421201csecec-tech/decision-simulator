import { NextRequest, NextResponse } from "next/server";
import {
  getLatestSimulation,
  runSimulation,
} from "@/lib/server/thread-store";
import { errorResponse, simulationVariablesSchema } from "@/lib/server/validation";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const run = await getLatestSimulation(threadId);

  if (!run) {
    return NextResponse.json({ message: "Simulation run not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const body = (await request.json().catch(() => null)) as unknown;

  if (!body) {
    return errorResponse("Invalid payload", 400);
  }

  const parsed = simulationVariablesSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const run = await runSimulation(threadId, parsed.data);

  if (!run) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ run }, { status: 201 });
}
