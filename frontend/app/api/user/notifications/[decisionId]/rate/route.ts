import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  const { decisionId } = await params;
  const proxied = await proxyRequestToCoreBackend({
    request,
    path: `/api/v1/user/notifications/${decisionId}/rate`,
    method: "POST",
  });
  if (proxied) return proxied;
  return NextResponse.json({ message: "Backend unavailable" }, { status: 503 });
}
