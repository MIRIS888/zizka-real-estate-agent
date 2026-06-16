import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getN8nEnvironment } from "@/lib/env";
import {
  DailyReportWebhookSchema,
  storeDailyReport,
} from "@/lib/tools/daily-report";

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

    const payload = DailyReportWebhookSchema.parse(await request.json());
    const result = await storeDailyReport(payload);

    return NextResponse.json({
      accepted: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Daily report webhook payload has invalid format." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unexpected webhook error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
