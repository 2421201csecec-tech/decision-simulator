import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request,
    path: `/api/v1/threads/${threadId}/rebuild`,
    method: "POST",
  });
  if (proxied) return proxied;

  return NextResponse.json({ message: "Rebuild requires core backend" }, { status: 501 });
}
