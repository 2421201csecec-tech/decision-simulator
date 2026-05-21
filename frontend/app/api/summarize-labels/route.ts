import { NextRequest, NextResponse } from "next/server";
import { isCoreBackendProxyEnabled } from "@/lib/server/core-backend-proxy";
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.CORE_BACKEND_URL?.replace(/\/$/, "") ?? "";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({ items: [] }));

  if (BACKEND_URL && isCoreBackendProxyEnabled()) {
    try {
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = { "content-type": "application/json" };
      if (session?.access_token) headers["authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch(`${BACKEND_URL}/api/v1/summarize-labels`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (res.ok) return NextResponse.json(await res.json());
    } catch {}
  }

  return NextResponse.json({ labels: body.items ?? [] });
}
