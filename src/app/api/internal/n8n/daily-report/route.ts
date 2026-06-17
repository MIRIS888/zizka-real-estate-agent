import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { getN8nEnvironment } from "@/lib/env";
import { generateDailyReportPayload } from "@/lib/tools/daily-report-generator";

const GenerateDailyReportRequestSchema = z.object({
  workflowId: z.string().min(1).default("n8n-daily-ops-report"),
  reportDate: z.string().date(),
  timezone: z.string().min(1).default("Europe/Prague"),
  executedAt: z.string().datetime().optional(),
  delivery: z
    .object({
      channel: z.enum(["email", "slack", "dashboard", "none"]).default("dashboard"),
      recipient: z.string().trim().min(1).optional(),
      deliveredAt: z.string().datetime().optional(),
    })
    .optional(),
});

function isAuthorized(request: Request) {
  const environment = getN8nEnvironment();
  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${environment.N8N_WEBHOOK_SECRET}`;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }

    const payload = GenerateDailyReportRequestSchema.parse(await request.json());
    const report = await generateDailyReportPayload(payload);

    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Daily report generation payload has invalid format." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unexpected report generation error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
