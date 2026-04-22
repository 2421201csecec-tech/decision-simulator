import { NextResponse } from "next/server";

interface ProxyRequestOptions {
  request: Request;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
}

function getCoreBackendBaseUrl(): string | null {
  const raw = process.env.CORE_BACKEND_URL?.trim();
  if (!raw) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function isCoreBackendProxyEnabled(): boolean {
  return process.env.ENABLE_CORE_BACKEND_PROXY === "true" && Boolean(getCoreBackendBaseUrl());
}

async function toNextResponse(response: Response): Promise<NextResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  }

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: contentType ? { "content-type": contentType } : undefined,
  });
}

export async function proxyRequestToCoreBackend(options: ProxyRequestOptions): Promise<NextResponse | null> {
  if (!isCoreBackendProxyEnabled()) {
    return null;
  }

  const baseUrl = getCoreBackendBaseUrl();
  if (!baseUrl) {
    return null;
  }

  let search = "";
  try {
    search = new URL(options.request.url).search;
  } catch {
    search = "";
  }
  const url = `${baseUrl}${options.path}${search}`;

  try {
    const headers = new Headers();
    const contentType = options.request.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }

    const init: RequestInit = {
      method: options.method,
      headers,
      cache: "no-store",
    };

    if (options.method !== "GET") {
      init.body = await options.request.text();
    }

    const response = await fetch(url, init);
    return await toNextResponse(response);
  } catch {
    // In strangler mode we fallback to local route logic if proxy call fails.
    return null;
  }
}
