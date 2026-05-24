import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getCoreBackendBaseUrl(): string | null {
  const raw = process.env.CORE_BACKEND_URL?.trim();
  if (!raw) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function isCoreBackendProxyEnabled(): boolean {
  return process.env.ENABLE_CORE_BACKEND_PROXY === "true" && Boolean(getCoreBackendBaseUrl());
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  if (!isCoreBackendProxyEnabled()) {
    return NextResponse.json({ message: "File upload requires the backend proxy to be enabled." }, { status: 501 });
  }

  const baseUrl = getCoreBackendBaseUrl()!;
  const url = `${baseUrl}/api/v1/threads/${threadId}/upload`;

  try {
    const formData = await request.formData();

    const headers = new Headers();
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("authorization", `Bearer ${session.access_token}`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      return NextResponse.json(body, { status: response.status });
    }
    const text = await response.text();
    return new NextResponse(text, { status: response.status });
  } catch (err) {
    console.error("[upload proxy] backend unreachable", err);
    return NextResponse.json({ message: "Upload service temporarily unavailable" }, { status: 503 });
  }
}
