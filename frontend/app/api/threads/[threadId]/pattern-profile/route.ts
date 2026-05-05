import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/pattern-profile`,
    method: "GET",
  });
  if (proxied) return proxied;

  // Fallback: no pattern profile in TypeScript store
  return NextResponse.json({ patterns: [] });
}
