import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { withTempCwd } from "@/test-utils/with-temp-cwd";

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
});
