import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { withTempCwd } from "@/test-utils/with-temp-cwd";

function params(threadId: string) {
  return { params: Promise.resolve({ threadId }) };
}

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
