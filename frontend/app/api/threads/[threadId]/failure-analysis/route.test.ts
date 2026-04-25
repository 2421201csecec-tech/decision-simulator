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

const validPayload = {
  whatHappened: "Pricing was rejected by early users.",
  observations: ["Users churned in week 1", "NPS dropped below 20"],
  failedAssumptions: ["Users would accept Rs 2499 pricing"],
  rootCause: "Overestimated willingness to pay in the target segment.",
};

describe("failure-analysis local contracts", () => {
  it("returns default failure analysis for an existing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "FA Thread" });

      const response = await route.GET(
        new NextRequest(`http://localhost/api/threads/${thread.id}/failure-analysis`),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.failureAnalysis).toBeDefined();
      expect(Array.isArray(body.failureAnalysis.observations)).toBe(true);
    });
  });

  it("returns 404 GET for missing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/missing/failure-analysis"),
        params("missing")
      );

      expect(response.status).toBe(404);
    });
  });

  it("returns 400 for malformed PUT payload", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.PUT(
        new NextRequest("http://localhost/api/threads/x/failure-analysis", {
          method: "PUT",
          body: JSON.stringify({ whatHappened: "ok" }),
          headers: { "content-type": "application/json" },
        }),
        params("any-thread")
      );

      expect(response.status).toBe(400);
    });
  });

  it("returns 404 for PUT on missing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.PUT(
        new NextRequest("http://localhost/api/threads/x/failure-analysis", {
          method: "PUT",
          body: JSON.stringify(validPayload),
          headers: { "content-type": "application/json" },
        }),
        params("missing-thread-id")
      );

      expect(response.status).toBe(404);
    });
  });

  it("saves failure analysis and returns it with derived fields", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "FA Save Thread" });

      const response = await route.PUT(
        new NextRequest(`http://localhost/api/threads/${thread.id}/failure-analysis`, {
          method: "PUT",
          body: JSON.stringify(validPayload),
          headers: { "content-type": "application/json" },
        }),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.failureAnalysis.whatHappened).toBe(validPayload.whatHappened);
      expect(body.failureAnalysis.likelyRootCause).toBeDefined();
      expect(body.failureAnalysis.cognitiveBias).toBeDefined();
      expect(body.failureAnalysis.recommendation).toBeDefined();
      expect(body.failureAnalysis.updatedAt).toBeDefined();
    });
  });
});

describe("failure-analysis proxy contracts", () => {
  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = { failureAnalysis: { whatHappened: "backend answer", observations: [], failedAssumptions: [], rootCause: "", likelyRootCause: "", cognitiveBias: "", missedVariable: "", recommendation: "", updatedAt: "2026-01-01T00:00:00Z" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), { status: 200, headers: { "content-type": "application/json" } })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/t1/failure-analysis"),
        params("t1")
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/failure-analysis",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("proxies PUT to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = { failureAnalysis: { whatHappened: "saved", observations: [], failedAssumptions: [], rootCause: "", likelyRootCause: "", cognitiveBias: "", missedVariable: "", recommendation: "", updatedAt: "2026-01-01T00:00:00Z" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), { status: 200, headers: { "content-type": "application/json" } })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.PUT(
        new NextRequest("http://localhost/api/threads/t1/failure-analysis", {
          method: "PUT",
          body: JSON.stringify(validPayload),
          headers: { "content-type": "application/json" },
        }),
        params("t1")
      );

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/failure-analysis",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  it("falls back to local store for GET when proxy is unavailable", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend unavailable"));

      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "FA Fallback" });

      const response = await route.GET(
        new NextRequest(`http://localhost/api/threads/${thread.id}/failure-analysis`),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.failureAnalysis).toBeDefined();
    });
  });

  it("falls back to local store for PUT when proxy is unavailable", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend unavailable"));

      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "FA Fallback PUT" });

      const response = await route.PUT(
        new NextRequest(`http://localhost/api/threads/${thread.id}/failure-analysis`, {
          method: "PUT",
          body: JSON.stringify(validPayload),
          headers: { "content-type": "application/json" },
        }),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.failureAnalysis.whatHappened).toBe(validPayload.whatHappened);
    });
  });
});
