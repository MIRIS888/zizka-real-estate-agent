import { z } from "zod";

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
});

export const ChatResponseSchema = z.object({
  message: z.string().min(1),
  intent: z.enum([
    "analytics",
    "data_quality",
    "calendar",
    "email",
    "report",
    "market_watch",
    "general",
  ]),
  requiresConfirmation: z.boolean(),
  artifact: z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal("table"),
        title: z.string().min(1),
        columns: z.array(z.string().min(1)).min(1),
        rows: z.array(z.record(z.string(), z.string().or(z.number()))),
      }),
      z.object({
        type: z.literal("chart"),
        title: z.string().min(1),
        xKey: z.string().min(1),
        yKey: z.string().min(1).optional(),
        yKeys: z.array(z.string().min(1)).min(1).optional(),
        data: z.array(z.record(z.string(), z.string().or(z.number()))),
      }),
    ])
    .optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
