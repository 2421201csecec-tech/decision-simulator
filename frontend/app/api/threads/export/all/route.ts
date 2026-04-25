import { NextRequest, NextResponse } from "next/server";
import { getAllThreads, getDecisionOutputData } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

export async function GET(request: NextRequest) {
  const proxied = await proxyRequestToCoreBackend({
    request,
    path: "/api/v1/threads/export/all",
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const threads = await getAllThreads();
  const decisionOutputs = await Promise.all(threads.map((t) => getDecisionOutputData(t.id)));

  const threadExports = threads.map((thread, i) => ({
    threadId: thread.id,
    sections: {
      rawInput: thread.clarifyDraft ?? null,
      clarify: thread.clarifyDraft ?? null,
      pressureTest: thread.pressureTest ?? null,
      decisionOutput: decisionOutputs[i],
      failureAnalysis: thread.failureAnalysis ?? null,
    },
    omittedSections: ["simulation"],
  }));

  const today = new Date().toISOString().split("T")[0];
  const payload = {
    version: "v1",
    tier: "free",
    exportedAt: new Date().toISOString(),
    threads: threadExports,
  };

  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="threads-export-${today}.json"`,
    },
  });
}
