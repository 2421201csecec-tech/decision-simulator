import { NextRequest, NextResponse } from "next/server";
import { getDecisionOutputData } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/decision-output`,
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const output = await getDecisionOutputData(threadId);

  if (!output) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ output });
}
