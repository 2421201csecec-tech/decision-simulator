import { NextRequest, NextResponse } from "next/server";
import { getDecisionOutputData } from "@/lib/server/thread-store";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const output = await getDecisionOutputData(threadId);

  if (!output) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ output });
}
