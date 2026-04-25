import { NextRequest, NextResponse } from "next/server";
import { getDecisionOutputData, getThreadById } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/export`,
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const thread = await getThreadById(threadId);
  if (!thread) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  const decisionOutput = await getDecisionOutputData(threadId);
  const today = new Date().toISOString().split("T")[0];

  const payload = {
    version: "v1",
    tier: "free",
    threadId,
    exportedAt: new Date().toISOString(),
    sections: {
      rawInput: thread.clarifyDraft ?? null,
      clarify: thread.clarifyDraft ?? null,
      pressureTest: thread.pressureTest ?? null,
      decisionOutput,
      failureAnalysis: thread.failureAnalysis ?? null,
    },
    omittedSections: ["simulation"],
  };

  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="thread-${threadId}-export-${today}.json"`,
    },
  });
}
