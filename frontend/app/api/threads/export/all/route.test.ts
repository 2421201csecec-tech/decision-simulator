import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempCwd } from "@/test-utils/with-temp-cwd";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("all-threads export local contracts", () => {
  it("returns empty threads array when store is empty", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/export/all")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.version).toBe("v1");
      expect(body.tier).toBe("free");
      expect(Array.isArray(body.threads)).toBe(true);
      expect(body.threads).toHaveLength(0);
    });
  });

  it("includes all threads with correct section shape", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      await store.createThread({ title: "Thread A" });
      await store.createThread({ title: "Thread B" });

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/export/all")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.threads).toHaveLength(2);
      for (const t of body.threads) {
        expect(t.threadId).toBeDefined();
        expect(t.sections).toBeDefined();
        expect(t.omittedSections).toContain("simulation");
        expect(t.sections.simulation).toBeUndefined();
      }
    });
  });

  it("sets Content-Disposition header with correct filename format", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/export/all")
      );

      const disposition = response.headers.get("content-disposition");
      expect(disposition).toMatch(/attachment; filename="threads-export-\d{4}-\d{2}-\d{2}\.json"/);
    });
  });
});

describe("all-threads export proxy contracts", () => {
  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendPayload = { version: "v1", tier: "free", exportedAt: "2026-01-01T00:00:00Z", threads: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendPayload), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-disposition": 'attachment; filename="threads-export-2026-01-01.json"',
          },
        })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/export/all")
      );

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/export/all",
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
      await store.createThread({ title: "Fallback Thread" });

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/export/all")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.threads).toHaveLength(1);
    });
  });
});
