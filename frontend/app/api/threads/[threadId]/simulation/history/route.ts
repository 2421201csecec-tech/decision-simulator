import { NextRequest, NextResponse } from "next/server";
import { getSimulationHistory } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/simulation/history`,
    method: "GET",
  });
  if (proxied) {
    return proxied;
  }

  const runs = await getSimulationHistory(threadId);

  if (!runs) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ runs });
}
