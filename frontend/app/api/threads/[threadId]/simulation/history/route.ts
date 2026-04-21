import { NextRequest, NextResponse } from "next/server";
import { getSimulationHistory } from "@/lib/server/thread-store";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const runs = await getSimulationHistory(threadId);

  if (!runs) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ runs });
}
