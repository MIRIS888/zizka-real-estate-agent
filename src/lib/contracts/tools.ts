import { z } from "zod";

export const DateRangeSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
});

export const QueryLeadMetricsInputSchema = z.object({
  dateRange: DateRangeSchema,
  groupBy: z.enum(["month", "source", "status"]),
});

export const FindIncompletePropertiesInputSchema = z.object({
  fields: z
    .array(
      z.enum([
        "reconstruction_year",
        "building_modifications",
        "energy_rating",
        "floor_area",
      ]),
    )
    .min(1),
});

export const FindCalendarSlotsInputSchema = z.object({
  dateRange: DateRangeSchema,
  durationMinutes: z.number().int().min(15).max(240),
  timezone: z.string().min(1),
});

export const CreateEmailDraftInputSchema = z.object({
  recipientEmail: z.email().optional(),
  propertyTitle: z.string().min(1).max(200).optional(),
  tone: z.enum(["formal", "friendly"]).default("formal"),
  dateRange: DateRangeSchema.optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  timezone: z.string().min(1).optional(),
});

export const QuerySalesMetricsInputSchema = z.object({
  dateRange: DateRangeSchema,
});

export const CreateWeeklyReportInputSchema = z.object({
  weekStart: z.string().date().optional(),
  audience: z.enum(["management", "team"]).default("management"),
});

export const WatchMarketInputSchema = z.object({
  mode: z.enum(["preview", "schedule"]).default("preview"),
  locationQuery: z.string().min(1).optional(),
  cadence: z.enum(["daily", "weekly"]).default("daily"),
  scheduleDays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  scheduleTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timezone: z.string().min(1).default("Europe/Prague"),
});

export const SendMorningReportInputSchema = z.object({
  recipientEmail: z.email().optional(),
});

export const SendEmailInputSchema = z.object({
  to: z.email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const CreateScheduledTaskAgentInputSchema = z.object({
  task_type: z.literal("market_digest"),
  location: z.string().min(1),
  transaction: z.enum(["sale", "rent"]).default("sale"),
  schedule_time: z.string().regex(/^\d{2}:\d{2}$/),
  frequency: z.literal("daily").default("daily"),
  timezone: z.string().min(1).default("Europe/Prague"),
});

export const UpdateScheduledTaskAgentInputSchema = z.object({
  id: z.string().uuid(),
  schedule_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  location: z.string().min(1).optional(),
  transaction: z.enum(["sale", "rent"]).optional(),
  timezone: z.string().min(1).optional(),
});

export const DeleteScheduledTaskAgentInputSchema = z.object({
  id: z.string().uuid(),
  description: z.string().optional(),
});

export const AgentToolNameSchema = z.enum([
  "none",
  "query_lead_metrics",
  "query_sales_metrics",
  "find_incomplete_properties",
  "find_calendar_slots",
  "create_email_draft",
  "send_email",
  "create_weekly_report",
  "send_morning_report",
  "watch_market",
  "create_scheduled_task",
  "list_scheduled_tasks",
  "update_scheduled_task",
  "delete_scheduled_task",
]);

export const AgentPlanSchema = z.object({
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
  toolName: AgentToolNameSchema,
  toolInput: z.unknown().optional(),
  requiresConfirmation: z.boolean(),
});

export const AgentActionSchema = z.discriminatedUnion("action", [
  z.object({
    reasoning: z.string().min(1),
    action: z.literal("tool"),
    toolName: AgentToolNameSchema.exclude(["none"]),
    toolInput: z.unknown().optional(),
  }),
  z.object({
    reasoning: z.string().min(1),
    action: z.literal("confirm"),
    message: z.string().min(1),
  }),
  z.object({
    reasoning: z.string().min(1),
    action: z.literal("finish"),
    message: z.string().min(1),
  }),
]);

export type AgentToolName = z.infer<typeof AgentToolNameSchema>;
export type AgentPlan = z.infer<typeof AgentPlanSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type SendMorningReportInput = z.infer<typeof SendMorningReportInputSchema>;
