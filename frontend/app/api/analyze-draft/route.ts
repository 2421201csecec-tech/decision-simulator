import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

const EMPTY = { suggestions: [], missing_elements: [], biases: [] };

export async function POST(request: NextRequest) {
  const proxied = await proxyRequestToCoreBackend({
    request,
    path: "/api/v1/extract/analyze-draft",
    method: "POST",
  });
  if (proxied) return proxied;

  return NextResponse.json(EMPTY);
}
