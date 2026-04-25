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

describe("pressure-test proxy contracts", () => {
  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = {
        pressureTest: { scenarios: [], currentIndex: 0, responses: {}, completed: false, updatedAt: "2026-01-01T00:00:00Z" },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), { status: 200, headers: { "content-type": "application/json" } })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/t1/pressure-test"),
        params("t1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/pressure-test",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("proxies POST to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = {
        pressureTest: { scenarios: [], currentIndex: 0, responses: {}, completed: false, updatedAt: "2026-01-01T00:00:00Z" },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), { status: 200, headers: { "content-type": "application/json" } })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.POST(
        new NextRequest("http://localhost/api/threads/t1/pressure-test", { method: "POST" }),
        params("t1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/pressure-test",
        expect.objectContaining({ method: "POST" })
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
      const thread = await store.createThread({ title: "Fallback Thread" });
      await store.generatePressureTest(thread.id);

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/x/pressure-test"),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.pressureTest).toBeDefined();
    });
  });

  it("falls back to local store for POST when proxy is unavailable", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend unavailable"));

      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Fallback Generate" });

      const response = await route.POST(
        new NextRequest("http://localhost/api/threads/x/pressure-test", { method: "POST" }),
        params(thread.id)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.pressureTest.scenarios.length).toBeGreaterThan(0);
    });
  });
});

describe("pressure-test answer and skip contracts", () => {
  it("returns 400 for malformed answer payload", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const answerRoute = await import("./answer/route");
      const request = new NextRequest("http://localhost/api/threads/x/pressure-test/answer", {
        method: "POST",
        body: JSON.stringify({ scenarioId: 1 }),
        headers: { "content-type": "application/json" },
      });

      const response = await answerRoute.POST(request, params("missing-thread"));
      expect(response.status).toBe(400);
    });
  });

  it("returns 404 when answering before pressure test generation", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const answerRoute = await import("./answer/route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "No Pressure Yet" });

      const request = new NextRequest("http://localhost/api/threads/x/pressure-test/answer", {
        method: "POST",
        body: JSON.stringify({ scenarioId: 1, answer: "test" }),
        headers: { "content-type": "application/json" },
      });

      const response = await answerRoute.POST(request, params(thread.id));
      expect(response.status).toBe(404);
    });
  });

  it("returns 409 for answer and skip when scenario does not match current step", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const pressureRoute = await import("./route");
      const answerRoute = await import("./answer/route");
      const skipRoute = await import("./skip/route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Pressure Mismatch" });

      await pressureRoute.POST(new NextRequest("http://localhost/api/threads/x/pressure-test", { method: "POST" }), params(thread.id));

      const badAnswerRequest = new NextRequest("http://localhost/api/threads/x/pressure-test/answer", {
        method: "POST",
        body: JSON.stringify({ scenarioId: 3, answer: "wrong step" }),
        headers: { "content-type": "application/json" },
      });
      const answerResponse = await answerRoute.POST(badAnswerRequest, params(thread.id));

      const badSkipRequest = new NextRequest("http://localhost/api/threads/x/pressure-test/skip", {
        method: "POST",
        body: JSON.stringify({ scenarioId: 4 }),
        headers: { "content-type": "application/json" },
      });
      const skipResponse = await skipRoute.POST(badSkipRequest, params(thread.id));

      expect(answerResponse.status).toBe(409);
      expect(skipResponse.status).toBe(409);
    });
  });
});
