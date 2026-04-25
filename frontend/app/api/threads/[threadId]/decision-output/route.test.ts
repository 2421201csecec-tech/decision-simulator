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

describe("decision-output local contracts", () => {
  it("returns derived output for an existing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Decision Thread" });

      const response = await route.GET(
        new NextRequest(`http://localhost/api/threads/${thread.id}/decision-output`),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.output.decisionTitle).toBeDefined();
      expect(Array.isArray(body.output.keyReasons)).toBe(true);
      expect(Array.isArray(body.output.keyRisks)).toBe(true);
      expect(typeof body.output.decisionStrength).toBe("number");
    });
  });

  it("returns 404 for missing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/missing/decision-output"),
        params("missing")
      );

      expect(response.status).toBe(404);
    });
  });
});

describe("decision-output proxy contracts", () => {
  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = { output: { decisionTitle: "from backend", finalDecision: "", keyReasons: [], keyRisks: [], assumptions: [], decisionStrength: 60, strengths: [], weakPoints: [], suggestedExperiment: "" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), { status: 200, headers: { "content-type": "application/json" } })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/t1/decision-output"),
        params("t1")
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/decision-output",
        expect.objectContaining({ method: "GET" })
      );
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
      const thread = await store.createThread({ title: "DO Fallback" });

      const response = await route.GET(
        new NextRequest(`http://localhost/api/threads/${thread.id}/decision-output`),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.output.decisionTitle).toBeDefined();
    });
  });
});
