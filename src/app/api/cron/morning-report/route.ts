import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron/auth";
import { buildMorningReport } from "@/lib/tools/morning-report";
import { loadGoogleAccount } from "@/lib/google/token-store";
import { sendGmailMessage } from "@/lib/google/oauth";
import { createSupabaseServiceClient, getDefaultOrganizationId } from "@/lib/supabase/server";

const WORKFLOW_ID = "morning-report-cron";

function getTodayPrague(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}

// GET: called by Vercel Cron — delegates to POST so idempotency check always runs
export async function GET(request: Request) {
  return POST(request);
}

// POST: called by N8N (same auth). Returns N8N-compatible envelope.
// Idempotent: skips send if already sent today (daily_report_runs table).
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const organizationId = getDefaultOrganizationId();
    const reportDate = getTodayPrague();
    const supabase = createSupabaseServiceClient();

    const { data: existing } = await supabase
      .from("daily_report_runs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("report_date", reportDate)
      .eq("n8n_workflow_id", WORKFLOW_ID)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        task: "morning-report",
        summary: "Ranní report byl dnes již odeslán",
        sentTo: [],
      });
    }

    const account = await loadGoogleAccount();
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "Žádný Google účet není připojený. Propoj Google v aplikaci." },
        { status: 503 },
      );
    }

    const report = await buildMorningReport();

    const { messageId } = await sendGmailMessage(account.token, {
      to: account.email,
      subject: report.subject,
      body: report.text,
      html: report.html,
    });

    await supabase.from("daily_report_runs").insert({
      organization_id: organizationId,
      n8n_workflow_id: WORKFLOW_ID,
      report_date: reportDate,
      timezone: "Europe/Prague",
      executed_at: new Date().toISOString(),
      summary: report.subject,
      metrics: {
        totalLeads: report.totalLeads,
        incompleteCount: report.incompleteCount,
        listingCount: report.listingCount,
      },
      delivery_channel: "email",
      delivery_recipient: account.email,
      delivered_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      task: "morning-report",
      summary: `${report.subject} — odesláno (messageId: ${messageId})`,
      sentTo: [account.email],
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
