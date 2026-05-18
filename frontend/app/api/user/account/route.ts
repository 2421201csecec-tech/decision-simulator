import { NextRequest, NextResponse } from "next/server";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

export async function DELETE(request: NextRequest) {
  const proxied = await proxyRequestToCoreBackend({
    request,
    path: "/api/v1/user/account",
    method: "DELETE",
  });
  if (proxied) return proxied;
  return NextResponse.json({ message: "Backend unavailable" }, { status: 503 });
}
