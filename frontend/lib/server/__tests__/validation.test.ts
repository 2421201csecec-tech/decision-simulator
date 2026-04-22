import { describe, expect, it } from "vitest";
import {
  clarifyDraftSchema,
  createThreadSchema,
  pressureAnswerSchema,
  simulationVariablesSchema,
} from "@/lib/server/validation";

describe("validation schemas", () => {
  it("accepts both Rs and rupee symbol for currency", () => {
    const rsResult = simulationVariablesSchema.safeParse({
      price: "Rs 50,000",
      targetMarket: "Mass Market",
      marketingSpend: "Rs 20,000",
      timeHorizon: "3 Months",
    });

    const symbolResult = simulationVariablesSchema.safeParse({
      price: "₹50,000",
      targetMarket: "Enterprise",
      marketingSpend: "₹10,000",
      timeHorizon: "1 Month",
    });

    expect(rsResult.success).toBe(true);
    expect(symbolResult.success).toBe(true);
  });

  it("rejects invalid currency format", () => {
    const result = simulationVariablesSchema.safeParse({
      price: "USD 200",
      targetMarket: "Mass Market",
      marketingSpend: "Rs 20,000",
      timeHorizon: "3 Months",
    });

    expect(result.success).toBe(false);
  });

  it("rejects clarify lists above max limit", () => {
    const items = Array.from({ length: 21 }, (_, i) => `item-${i}`);
    const result = clarifyDraftSchema.safeParse({
      title: "title",
      coreProblem: "problem",
      desiredOutcome: "outcome",
      context: "context",
      constraints: items,
      assumptions: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects malformed create-thread payloads", () => {
    const result = createThreadSchema.safeParse({
      parentThreadId: "not-a-uuid",
      status: "paused",
    });

    expect(result.success).toBe(false);
  });

  it("requires non-empty pressure answer", () => {
    const result = pressureAnswerSchema.safeParse({
      scenarioId: 1,
      answer: "   ",
    });

    expect(result.success).toBe(false);
  });
});
