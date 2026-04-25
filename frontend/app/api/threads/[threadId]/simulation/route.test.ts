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

const validVariables = {
  price: "Rs 1,999",
  targetMarket: "Early Adopters",
  marketingSpend: "Rs 50,000",
  timeHorizon: "3 Months",
};

describe("simulation route contracts", () => {
  it("returns 404 for GET on thread with no simulation runs", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "No Sims Yet" });

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/x/simulation"),
        params(thread.id)
      );

      expect(response.status).toBe(404);
    });
  });

  it("returns 400 for POST with invalid payload", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.POST(
        new NextRequest("http://localhost/api/threads/x/simulation", {
          method: "POST",
          body: JSON.stringify({ price: "bad" }),
          headers: { "content-type": "application/json" },
        }),
        params("any-thread")
      );

      expect(response.status).toBe(400);
    });
  });

  it("returns 404 for POST on missing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const response = await route.POST(
        new NextRequest("http://localhost/api/threads/x/simulation", {
          method: "POST",
          body: JSON.stringify(validVariables),
          headers: { "content-type": "application/json" },
        }),
        params("missing-thread-id")
      );

      expect(response.status).toBe(404);
    });
  });

  it("creates a simulation run and returns it with 201", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Sim Thread" });

      const postResponse = await route.POST(
        new NextRequest("http://localhost/api/threads/x/simulation", {
          method: "POST",
          body: JSON.stringify(validVariables),
          headers: { "content-type": "application/json" },
        }),
        params(thread.id)
      );

      expect(postResponse.status).toBe(201);
      const postBody = await postResponse.json();
      expect(postBody.run.id).toBeDefined();
      expect(postBody.run.results.adoptionProjection).toBeDefined();

      const getResponse = await route.GET(
        new NextRequest("http://localhost/api/threads/x/simulation"),
        params(thread.id)
      );
      expect(getResponse.status).toBe(200);
      const getBody = await getResponse.json();
      expect(getBody.run.id).toBe(postBody.run.id);
    });
  });

  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = { run: { id: "run-1", variables: validVariables, results: {}, createdAt: "2026-01-01T00:00:00Z" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), { status: 200, headers: { "content-type": "application/json" } })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/t1/simulation"),
        params("t1")
      );

      expect(response.status).toBe(200);
      expect((await response.json())).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/simulation",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("proxies POST to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = { run: { id: "run-2", variables: validVariables, results: {}, createdAt: "2026-01-01T00:00:00Z" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), { status: 201, headers: { "content-type": "application/json" } })
      );

      vi.resetModules();
      const route = await import("./route");
      const response = await route.POST(
        new NextRequest("http://localhost/api/threads/t1/simulation", {
          method: "POST",
          body: JSON.stringify(validVariables),
          headers: { "content-type": "application/json" },
        }),
        params("t1")
      );

      expect(response.status).toBe(201);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/t1/simulation",
        expect.objectContaining({ method: "POST" })
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
      const thread = await store.createThread({ title: "Fallback Sim" });

      const response = await route.POST(
        new NextRequest("http://localhost/api/threads/x/simulation", {
          method: "POST",
          body: JSON.stringify(validVariables),
          headers: { "content-type": "application/json" },
        }),
        params(thread.id)
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.run.results.adoptionProjection).toBeDefined();
    });
  });
});
