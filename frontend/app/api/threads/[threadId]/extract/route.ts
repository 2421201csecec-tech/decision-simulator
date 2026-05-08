import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request,
    path: `/api/v1/threads/${threadId}/extract`,
    method: "POST",
  });
  if (proxied) {
    return proxied;
  }

  // Threads in frontend-only store have no backend extraction pipeline.
  return NextResponse.json(
    { message: "Extraction not available for this thread" },
    { status: 404 }
  );
}
