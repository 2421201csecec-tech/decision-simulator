import { NextRequest, NextResponse } from "next/server";

const EMPTY = { suggestions: [], missing_elements: [], biases: [] };

export async function POST(request: NextRequest) {
  const backendUrl = process.env.CORE_BACKEND_URL?.replace(/\/$/, "");
  if (!backendUrl) return NextResponse.json(EMPTY);

  try {
    const body = await request.text();
    const res = await fetch(`${backendUrl}/api/v1/extract/analyze-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    if (res.ok) return NextResponse.json(await res.json());
  } catch {
    // backend unavailable — fall through
  }

  return NextResponse.json(EMPTY);
}
