import { z } from "zod";

export const THREAD_STATUS_VALUES = ["active", "revision", "failed", "completed"] as const;

const textList = z.array(z.string().trim().min(1).max(120)).max(20);

const rupeeText = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .refine((value) => /^(Rs|₹)\s?[0-9][0-9,]*$/i.test(value), {
    message: "Must be in format like 'Rs 50,000' or '₹50,000'",
  });

export const createThreadSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  parentThreadId: z.string().uuid().optional(),
  status: z.enum(THREAD_STATUS_VALUES).optional(),
});

export const clarifyDraftSchema = z.object({
  title: z.string().trim().max(150),
  coreProblem: z.string().trim().max(500),
  desiredOutcome: z.string().trim().max(500),
  context: z.string().trim().max(500),
  constraints: textList,
  assumptions: textList,
});

export const pressureAnswerSchema = z.object({
  scenarioId: z.number().int().positive(),
  answer: z.string().trim().min(1).max(500),
});

export const pressureSkipSchema = z.object({
  scenarioId: z.number().int().positive(),
});

export const simulationVariablesSchema = z.object({
  price: rupeeText,
  targetMarket: z.enum(["Early Adopters", "Mass Market", "Enterprise"]),
  marketingSpend: rupeeText,
  timeHorizon: z.enum(["1 Month", "3 Months", "6 Months"]),
});

export const failureAnalysisSchema = z.object({
  whatHappened: z.string().trim().max(500),
  observations: textList,
  failedAssumptions: textList,
  rootCause: z.string().trim().max(300),
});

export function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status });
}
