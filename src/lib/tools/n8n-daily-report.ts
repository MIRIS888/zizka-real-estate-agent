import { z } from "zod";

import {
  getN8nDailyReportEnvironment,
  isN8nDailyReportConfigured,
} from "@/lib/env";
import { DailyReportWebhookSchema } from "@/lib/tools/daily-report";
import { RunDailyReportInputSchema } from "@/lib/contracts/tools";

const N8nDailyReportResponseSchema = z.object({
  report: DailyReportWebhookSchema,
  stored: z
    .object({
      stored: z.boolean().optional(),
      organizationId: z.string().optional(),
      dailyReportRunId: z.string().nullable().optional(),
      message: z.string().optional(),
    })
    .optional(),
  email: z
    .object({
      sent: z.boolean(),
      recipient: z.string().optional(),
      messageId: z.string().optional(),
    })
    .optional(),
});

export type N8nDailyReportResult = z.infer<typeof N8nDailyReportResponseSchema>;

function getDefaultReportDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function runN8nDailyReport(rawInput: unknown) {
  const input = RunDailyReportInputSchema.parse(rawInput);

  if (!isN8nDailyReportConfigured()) {
    return {
      configured: false as const,
      report: null,
      message:
        "n8n daily report trigger is not configured. Add N8N_DAILY_REPORT_WEBHOOK_URL and N8N_WEBHOOK_SECRET.",
    };
  }

  const environment = getN8nDailyReportEnvironment();
  const response = await fetch(environment.N8N_DAILY_REPORT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.N8N_WEBHOOK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "chat",
      requestedAt: new Date().toISOString(),
      reportDate: input.reportDate ?? getDefaultReportDate(),
      timezone: input.timezone,
      deliveryChannel: input.deliveryChannel,
      recipientEmail: input.recipientEmail,
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `n8n daily report trigger failed with status ${response.status}.`;

    throw new Error(error);
  }

  return {
    configured: true as const,
    ...N8nDailyReportResponseSchema.parse(payload),
  };
}
