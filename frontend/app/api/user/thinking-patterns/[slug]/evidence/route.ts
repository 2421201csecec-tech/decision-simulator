import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const proxied = await proxyRequestToCoreBackend({
    request,
    path: `/api/v1/user/thinking-patterns/${slug}/evidence`,
    method: "GET",
  });
  if (proxied) return proxied;
  return NextResponse.json({ message: "Backend unavailable" }, { status: 503 });
}
