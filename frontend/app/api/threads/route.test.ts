import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempCwd } from "@/test-utils/with-temp-cwd";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("threads route contracts", () => {
  it("returns 400 for invalid JSON payload", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const request = new NextRequest("http://localhost/api/threads", {
        method: "POST",
        body: "not-json",
        headers: { "content-type": "application/json" },
      });

      const response = await route.POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe("Invalid payload");
    });
  });

  it("returns 400 for invalid create payload shape", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const request = new NextRequest("http://localhost/api/threads", {
        method: "POST",
        body: JSON.stringify({ status: "paused", parentThreadId: "bad-id" }),
        headers: { "content-type": "application/json" },
      });

      const response = await route.POST(request);
      expect(response.status).toBe(400);
    });
  });

  it("returns grouped thread buckets when grouped=true", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");

      const createRequest = new NextRequest("http://localhost/api/threads", {
        method: "POST",
        body: JSON.stringify({ title: "Grouped Thread" }),
        headers: { "content-type": "application/json" },
      });
      await route.POST(createRequest);

      const getRequest = new NextRequest("http://localhost/api/threads?grouped=true");
      const response = await route.GET(getRequest);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body.active)).toBe(true);
      expect(Array.isArray(body.revisions)).toBe(true);
      expect(Array.isArray(body.failureAnalysis)).toBe(true);
      expect(Array.isArray(body.history)).toBe(true);
    });
  });

  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = {
        active: [],
        revisions: [],
        failureAnalysis: [],
        history: [],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      vi.resetModules();
      const route = await import("./route");
      const request = new NextRequest("http://localhost/api/threads?grouped=true");

      const response = await route.GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads?grouped=true",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("proxies POST to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendThread = {
        id: "thread-1",
        title: "From Backend",
        status: "active",
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendThread), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      );

      vi.resetModules();
      const route = await import("./route");
      const request = new NextRequest("http://localhost/api/threads", {
        method: "POST",
        body: JSON.stringify({ title: "From UI" }),
        headers: { "content-type": "application/json" },
      });

      const response = await route.POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body).toEqual(backendThread);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("falls back to local route logic when proxy request fails", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend unavailable"));

      vi.resetModules();
      const route = await import("./route");

      const createRequest = new NextRequest("http://localhost/api/threads", {
        method: "POST",
        body: JSON.stringify({ title: "Fallback Local Thread" }),
        headers: { "content-type": "application/json" },
      });
      const createResponse = await route.POST(createRequest);

      const getRequest = new NextRequest("http://localhost/api/threads?grouped=true");
      const getResponse = await route.GET(getRequest);
      const groupedBody = await getResponse.json();

      expect(createResponse.status).toBe(201);
      expect(getResponse.status).toBe(200);
      expect(groupedBody.active.length).toBe(1);
      expect(groupedBody.active[0].title).toBe("Fallback Local Thread");
    });
  });
});
