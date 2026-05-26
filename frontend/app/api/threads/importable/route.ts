import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

export async function GET(request: NextRequest) {
  const proxied = await proxyRequestToCoreBackend({
    request,
    path: "/api/v1/threads/importable",
    method: "GET",
  });
  if (proxied) return proxied;
  return NextResponse.json({ threads: [] });
}
