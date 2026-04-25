import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempCwd } from "@/test-utils/with-temp-cwd";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

function params(threadId: string) {
  return { params: Promise.resolve({ threadId }) };
}

describe("per-thread export local contracts", () => {
  it("returns 404 for missing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/missing/export"),
        params("missing")
      );

      expect(response.status).toBe(404);
    });
  });

  it("returns export payload with correct sections and omittedSections", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Export Thread" });

      const response = await route.GET(
        new NextRequest(`http://localhost/api/threads/${thread.id}/export`),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.version).toBe("v1");
      expect(body.tier).toBe("free");
      expect(body.threadId).toBe(thread.id);
      expect(body.sections.rawInput).toBeDefined();
      expect(body.sections.clarify).toBeDefined();
      expect(body.omittedSections).toContain("simulation");
      expect(body.sections.simulation).toBeUndefined();
    });
  });

  it("sets Content-Disposition header with correct filename format", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Export Header Thread" });

      const response = await route.GET(
        new NextRequest(`http://localhost/api/threads/${thread.id}/export`),
        params(thread.id)
      );

      const disposition = response.headers.get("content-disposition");
      expect(disposition).toMatch(/attachment; filename="thread-.+-export-\d{4}-\d{2}-\d{2}\.json"/);
    });
  });
});

describe("per-thread export proxy contracts", () => {
  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendPayload = { version: "v1", tier: "free", threadId: "t1", exportedAt: "2026-01-01T00:00:00Z", sections: {}, omittedSections: ["simulation"] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendPayload), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-disposition": 'attachment; filename="thread-t1-export-2026-01-01.json"',
          },
        })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/t1/export"),
        params("t1")
      );

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/export",
        expect.objectContaining({ method: "GET" })
      );
      expect(response.headers.get("content-disposition")).toMatch(/attachment/);
    });
  });

  it("falls back to local store when proxy is unavailable", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend unavailable"));

      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Export Fallback" });

      const response = await route.GET(
        new NextRequest(`http://localhost/api/threads/${thread.id}/export`),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.version).toBe("v1");
      expect(body.omittedSections).toContain("simulation");
    });
  });
});
