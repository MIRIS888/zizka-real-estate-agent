import { z } from "zod";

import { getDataSourceEnvironment } from "@/lib/env";
import {
  createSupabaseServiceClient,
  getDefaultOrganizationId,
} from "@/lib/supabase/server";

export const DailyReportWebhookSchema = z.object({
  workflowId: z.string().min(1),
  reportDate: z.string().date(),
  timezone: z.string().min(1).default("Europe/Prague"),
  executedAt: z.string().datetime(),
  summary: z.string().trim().min(1),
  metrics: z
    .object({
      newLeads: z.number().int().nonnegative().default(0),
      scheduledViewings: z.number().int().nonnegative().default(0),
      soldProperties: z.number().int().nonnegative().default(0),
      incompleteProperties: z.number().int().nonnegative().default(0),
      newMarketListings: z.number().int().nonnegative().default(0),
    })
    .default({
      newLeads: 0,
      scheduledViewings: 0,
      soldProperties: 0,
      incompleteProperties: 0,
      newMarketListings: 0,
    }),
  highlights: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string().trim().min(1)).default([]),
  nextActions: z.array(z.string().trim().min(1)).default([]),
  delivery: z
    .object({
      channel: z.enum(["email", "slack", "dashboard", "none"]).default("dashboard"),
      recipient: z.string().trim().min(1).optional(),
      deliveredAt: z.string().datetime().optional(),
    })
    .default({ channel: "dashboard" }),
});

export type DailyReportWebhook = z.infer<typeof DailyReportWebhookSchema>;

type DailyReportRunRow = {
  id: string;
};

export async function storeDailyReport(payload: DailyReportWebhook) {
  const organizationId = getDefaultOrganizationId();
  const dataSource = getDataSourceEnvironment();

  if (dataSource.DATA_SOURCE === "local") {
    return {
      stored: false,
      organizationId,
      dailyReportRunId: null,
      message:
        "Daily report payload is valid. Set DATA_SOURCE=supabase to store it in the database.",
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("daily_report_runs")
    .insert({
      organization_id: organizationId,
      n8n_workflow_id: payload.workflowId,
      report_date: payload.reportDate,
      timezone: payload.timezone,
      executed_at: payload.executedAt,
      summary: payload.summary,
      metrics: payload.metrics,
      highlights: payload.highlights,
      risks: payload.risks,
      next_actions: payload.nextActions,
      delivery_channel: payload.delivery.channel,
      delivery_recipient: payload.delivery.recipient ?? null,
      delivered_at: payload.delivery.deliveredAt ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to store daily report: ${error.message}`);
  }

  return {
    stored: true,
    organizationId,
    dailyReportRunId: (data as DailyReportRunRow).id,
    message: "Daily report stored.",
  };
}
