import { z } from "zod";

export const ChatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8_000),
});

export const PendingToolSchema = z.object({
  toolName: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  history: z.array(ChatHistoryItemSchema).max(20).optional(),
  confirmationToken: z.string().optional(),
  pendingTool: PendingToolSchema.optional(),
  threadId: z.string().uuid().optional(),
});

export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;

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
  source: z
    .object({
      label: z.string().min(1),
      detail: z.string().min(1),
      mode: z.enum(["local_demo", "supabase", "planned_integration", "live", "mock_fallback", "not_configured"]),
    })
    .optional(),
  requiresConfirmation: z.boolean(),
  emailDraft: z
    .object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    })
    .optional(),
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
  artifacts: z
    .array(
      z.discriminatedUnion("type", [
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
      ]),
    )
    .optional(),
  generatedOutputs: z
    .array(
      z.object({
        type: z.enum(["markdown", "csv", "presentation", "text"]),
        title: z.string().min(1),
        filename: z.string().min(1),
        content: z.string().min(1),
        mimeType: z.string().min(1),
      }),
    )
    .optional(),
  confirmationToken: z.string().optional(),
  pendingTool: PendingToolSchema.optional(),
  threadId: z.string().uuid().optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// DB types
export type ChatThread = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
