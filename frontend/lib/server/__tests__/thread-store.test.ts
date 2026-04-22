import { describe, expect, it, vi } from "vitest";
import { withTempCwd } from "@/test-utils/with-temp-cwd";

describe("thread store critical flows", () => {
  it("creates a new active thread and places it in grouped active", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const store = await import("@/lib/server/thread-store");

      const created = await store.createThread({ title: "New Decision" });
      const grouped = await store.getGroupedThreads();

      expect(created.status).toBe("active");
      expect(grouped.active).toHaveLength(1);
      expect(grouped.active[0]?.id).toBe(created.id);
    });
  });

  it("invalidates downstream artifacts on clarify save and reactivates failed thread", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const store = await import("@/lib/server/thread-store");

      const thread = await store.createThread({ title: "Failed Decision", status: "failed" });
      await store.generatePressureTest(thread.id);
      await store.runSimulation(thread.id, {
        price: "Rs 1999",
        targetMarket: "Mass Market",
        marketingSpend: "Rs 75,000",
        timeHorizon: "3 Months",
      });
      await store.saveFailureAnalysis(thread.id, {
        whatHappened: "Adoption was weak",
        observations: ["Low signups"],
        failedAssumptions: ["Users prefer premium"],
        rootCause: "Pricing mismatch",
      });

      const saved = await store.saveClarifyDraft(thread.id, {
        title: "Reframed Decision",
        coreProblem: "Pricing fit",
        desiredOutcome: "Increase conversion",
        context: "SMB launch",
        constraints: ["Budget limited"],
        assumptions: ["Demand exists"],
      });

      expect(saved?.status).toBe("active");
      expect(saved?.pressureTest).toBeUndefined();
      expect(saved?.simulationRuns).toBeUndefined();
      expect(saved?.failureAnalysis).toBeUndefined();
    });
  });

  it("advances pressure-test for answer and skip actions", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const store = await import("@/lib/server/thread-store");

      const thread = await store.createThread({ title: "Pressure Flow" });
      await store.generatePressureTest(thread.id);

      const afterAnswer = await store.submitPressureAnswer(thread.id, 1, "We keep value pricing");
      expect(afterAnswer?.currentIndex).toBe(1);
      expect(afterAnswer?.responses["1"]?.skipped).toBe(false);

      const afterSkip = await store.skipPressureScenario(thread.id, 2);
      expect(afterSkip?.currentIndex).toBe(2);
      expect(afterSkip?.responses["2"]?.skipped).toBe(true);
      expect(afterSkip?.completed).toBe(false);
    });
  });

  it("stores latest simulation first and keeps history", async () => {
    await withTempCwd(async () => {
      vi.resetModules();
      const store = await import("@/lib/server/thread-store");

      const thread = await store.createThread({ title: "Simulation History" });
      const first = await store.runSimulation(thread.id, {
        price: "Rs 1999",
        targetMarket: "Early Adopters",
        marketingSpend: "Rs 50,000",
        timeHorizon: "3 Months",
      });
      const second = await store.runSimulation(thread.id, {
        price: "Rs 2499",
        targetMarket: "Enterprise",
        marketingSpend: "Rs 1,00,000",
        timeHorizon: "6 Months",
      });

      const latest = await store.getLatestSimulation(thread.id);
      const history = await store.getSimulationHistory(thread.id);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(latest?.id).toBe(second?.id);
      expect(history).toHaveLength(2);
      expect(history?.[0]?.id).toBe(second?.id);
      expect(history?.[1]?.id).toBe(first?.id);
    });
  });
});
