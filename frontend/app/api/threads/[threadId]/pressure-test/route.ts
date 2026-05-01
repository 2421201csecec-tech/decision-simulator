import { NextRequest, NextResponse } from "next/server";
import { generatePressureTest, getPressureTest } from "@/lib/server/thread-store";
import { proxyRequestToCoreBackend } from "@/lib/server/core-backend-proxy";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/pressure-test`,
    method: "GET",
  });
  if (proxied) return proxied;

  const pressureTest = await getPressureTest(threadId);
  if (!pressureTest) {
    return NextResponse.json({ message: "Pressure test not found" }, { status: 404 });
  }
  return NextResponse.json({ pressureTest });
}

export async function POST(_: NextRequest, { params }: Params) {
  const { threadId } = await params;

  const proxied = await proxyRequestToCoreBackend({
    request: _,
    path: `/api/v1/threads/${threadId}/pressure-test`,
    method: "POST",
  });
  if (proxied) return proxied;

  const result = await generatePressureTest(threadId);
  if (!result) {
    return NextResponse.json({ message: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ pressureTest: result.pressureTest });
}
