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

describe("clarify-draft route contracts", () => {
  it("returns 400 for malformed payload", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const request = new NextRequest("http://localhost/api/threads/x/clarify-draft", {
        method: "PUT",
        body: "not-json",
        headers: { "content-type": "application/json" },
      });

      const response = await route.PUT(request, params("missing-thread"));
      expect(response.status).toBe(400);
    });
  });

  it("returns 404 for valid payload on missing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const request = new NextRequest("http://localhost/api/threads/x/clarify-draft", {
        method: "PUT",
        body: JSON.stringify({
          title: "Decision",
          coreProblem: "Problem",
          desiredOutcome: "Outcome",
          context: "Context",
          constraints: ["Budget"],
          assumptions: ["Demand"],
        }),
        headers: { "content-type": "application/json" },
      });

      const response = await route.PUT(request, params("missing-thread"));
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.message).toBe("Thread not found");
    });
  });

  it("saves and returns clarify draft for an existing thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Draft Target" });

      const draftPayload = {
        title: "Reworked Decision",
        coreProblem: "Low conversions",
        desiredOutcome: "Improve activation",
        context: "Launch cohort",
        constraints: ["Team size"],
        assumptions: ["Users want trial"],
      };

      const putRequest = new NextRequest("http://localhost/api/threads/x/clarify-draft", {
        method: "PUT",
        body: JSON.stringify(draftPayload),
        headers: { "content-type": "application/json" },
      });
      const putResponse = await route.PUT(putRequest, params(thread.id));
      const putBody = await putResponse.json();

      expect(putResponse.status).toBe(200);
      expect(putBody.clarifyDraft.title).toBe("Reworked Decision");

      const getResponse = await route.GET(new NextRequest("http://localhost/api/threads/x/clarify-draft"), params(thread.id));
      const getBody = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(getBody.clarifyDraft.coreProblem).toBe("Low conversions");
    });
  });

  it("proxies GET to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = {
        threadId: "thread-proxy-1",
        clarifyDraft: {
          title: "Proxy Title",
          coreProblem: "Proxy Problem",
          desiredOutcome: "Proxy Outcome",
          context: "Proxy Context",
          constraints: [],
          assumptions: [],
        },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      vi.resetModules();
      const route = await import("./route");

      const response = await route.GET(
        new NextRequest("http://localhost/api/threads/thread-proxy-1/clarify-draft"),
        params("thread-proxy-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/thread-proxy-1/clarify-draft",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("proxies PUT to core backend when proxy flag is enabled", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      const backendBody = {
        threadId: "thread-proxy-1",
        clarifyDraft: {
          title: "Saved via Backend",
          coreProblem: "Proxy Problem",
          desiredOutcome: "Proxy Outcome",
          context: "Proxy Context",
          constraints: ["Budget"],
          assumptions: ["Demand"],
        },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(backendBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      vi.resetModules();
      const route = await import("./route");
      const request = new NextRequest("http://localhost/api/threads/thread-proxy-1/clarify-draft", {
        method: "PUT",
        body: JSON.stringify({
          title: "Saved via Backend",
          coreProblem: "Proxy Problem",
          desiredOutcome: "Proxy Outcome",
          context: "Proxy Context",
          constraints: ["Budget"],
          assumptions: ["Demand"],
        }),
        headers: { "content-type": "application/json" },
      });

      const response = await route.PUT(request, params("thread-proxy-1"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(backendBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/v1/threads/thread-proxy-1/clarify-draft",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  it("falls back to local clarify save when proxy request fails", async () => {
    await withTempCwd(async () => {
      process.env.ENABLE_CORE_BACKEND_PROXY = "true";
      process.env.CORE_BACKEND_URL = "http://127.0.0.1:8000";

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("backend unavailable"));

      vi.resetModules();
      const route = await import("./route");
      const store = await import("@/lib/server/thread-store");
      const thread = await store.createThread({ title: "Fallback Thread" });

      const response = await route.PUT(
        new NextRequest("http://localhost/api/threads/x/clarify-draft", {
          method: "PUT",
          body: JSON.stringify({
            title: "Fallback Saved",
            coreProblem: "Local core problem",
            desiredOutcome: "Local desired outcome",
            context: "Local context",
            constraints: ["Time"],
            assumptions: ["Demand"],
          }),
          headers: { "content-type": "application/json" },
        }),
        params(thread.id)
      );

      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.clarifyDraft.title).toBe("Fallback Saved");
    });
  });
});
