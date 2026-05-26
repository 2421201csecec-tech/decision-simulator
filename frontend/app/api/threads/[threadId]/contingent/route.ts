import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const proxied = await proxyRequestToCoreBackend({
    request: request.clone(),
    path: `/api/v1/threads/${threadId}/contingent`,
    method: "PUT",
  });
  if (proxied) return proxied;
  return NextResponse.json({ ok: true });
}
