import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron/auth";
import { getDueScheduledTasks, markTaskComplete, markTaskRun, type ScheduledTask } from "@/lib/tasks/scheduled-tasks";
import { searchMarketListings } from "@/lib/tools/market-search";
import { buildMorningReport } from "@/lib/tools/morning-report";
import { loadAndRefreshGoogleAccount } from "@/lib/google/token-store";
import { sendGmailMessage } from "@/lib/google/oauth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildMarketEmailHtml(
  location: string,
  listings: { title: string; description: string; url: string; source: string }[],
): string {
  if (listings.length === 0) {
    return `<p style="font-family:sans-serif">Dnes nebyly nalezeny nové nabídky pro lokalitu <strong>${escapeHtml(location)}</strong>.</p>
<p style="color:#999;font-size:12px">Automatický přehled ze Žižka Reality</p>`;
  }
  const rows = listings
    .slice(0, 10)
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee">
            <a href="${escapeHtml(l.url)}" style="color:#1a56db;font-weight:500">${escapeHtml(l.title)}</a><br>
            <span style="color:#6b7280;font-size:12px">${escapeHtml(l.description)}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:#9ca3af;font-size:12px;white-space:nowrap">${escapeHtml(l.source)}</td>
        </tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;font-family:sans-serif;font-size:14px">
  <thead><tr>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Nabídka — ${escapeHtml(location)}</th>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Zdroj</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="color:#999;font-size:12px;margin-top:16px;font-family:sans-serif">
  Automatický přehled ze Žižka Reality · Správa úloh v sekci Naplánované úlohy.
</p>`;
}

function buildMarketEmailText(location: string, listings: { title: string; url: string }[]): string {
  if (listings.length === 0) return `Nové nabídky – ${location}\n\nDnes nebyly nalezeny žádné nové nabídky.\n\nAutomatický přehled ze Žižka Reality`;
  return `Nové nabídky – ${location}\n\n${listings.slice(0, 10).map((l) => `- ${l.title}: ${l.url}`).join("\n")}\n\nAutomatický přehled ze Žižka Reality`;
}

// idempotency_key ties a task run to a specific scheduled window (next_run_at before execution)
function buildIdempotencyKey(task: ScheduledTask): string {
  return `${task.id}:${task.next_run_at}`;
}

// ─── Audit log helpers ────────────────────────────────────────────────────────

async function insertRunRecord(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  task: ScheduledTask,
  emailTo: string | null,
  emailFrom: string | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("scheduled_task_runs")
    .insert({
      task_id: task.id,
      user_id: task.user_id,
      status: "running",
      started_at: new Date().toISOString(),
      email_to: emailTo,
      email_from: emailFrom,
      idempotency_key: buildIdempotencyKey(task),
      metadata: { task_type: task.task_type },
    })
    .select("id")
    .single();

  if (error) {
    // Unique constraint violation → this window was already processed
    if (error.code === "23505") return null;
    // Other errors are non-fatal for the run itself, continue
    return null;
  }
  return (data as { id: string }).id;
}

async function updateRunRecord(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  runId: string,
  status: "success" | "failed" | "skipped",
  meta: Record<string, unknown>,
  errorMessage?: string,
) {
  await supabase
    .from("scheduled_task_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
      metadata: meta,
    })
    .eq("id", runId);
}

// ─── Task runners ─────────────────────────────────────────────────────────────

type RunResult = {
  taskId: string;
  taskType: string;
  sentTo: string | null;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  meta?: Record<string, unknown>;
};

async function runMarketDigest(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  task: ScheduledTask,
): Promise<RunResult> {
  const params = task.params as { location: string; transaction?: string; recipient_email?: string };
  const location = params.location;
  const transaction = params.transaction === "rent" ? "rent" : "sale";

  const account = await loadAndRefreshGoogleAccount(task.user_id);

  const recipientEmail = params.recipient_email ?? account?.email ?? null;

  const runId = await insertRunRecord(supabase, task, recipientEmail, account?.email ?? null);
  if (runId === null) {
    return { taskId: task.id, taskType: task.task_type, sentTo: null, ok: true, skipped: true };
  }

  try {
    if (!account) {
      throw new Error("Žádný připojený Google účet pro tohoto uživatele.");
    }

    const search = await searchMarketListings({ locationQuery: location, transaction });
    const listings = search.listings ?? [];

    if (recipientEmail) {
      await sendGmailMessage(account.token, {
        to: recipientEmail,
        subject: `Realitní přehled – ${location} (${listings.length} nabídek)`,
        body: buildMarketEmailText(location, listings),
        html: buildMarketEmailHtml(location, listings),
      });
    }

    if (task.run_once) {
      await markTaskComplete(task.id);
    } else {
      await markTaskRun(task.id, task.schedule_time, task.timezone, task.schedule_days);
    }
    const meta = { listingCount: listings.length, location };
    await updateRunRecord(supabase, runId, "success", meta);
    return { taskId: task.id, taskType: task.task_type, sentTo: recipientEmail, ok: true, meta };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updateRunRecord(supabase, runId, "failed", {}, errorMessage);
    return { taskId: task.id, taskType: task.task_type, sentTo: null, ok: false, error: errorMessage };
  }
}

async function runMorningReport(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  task: ScheduledTask,
): Promise<RunResult> {
  const params = task.params as { recipient_email?: string };
  const account = await loadAndRefreshGoogleAccount(task.user_id);
  const recipientEmail = params.recipient_email ?? account?.email ?? null;

  const runId = await insertRunRecord(supabase, task, recipientEmail, account?.email ?? null);
  if (runId === null) {
    return { taskId: task.id, taskType: task.task_type, sentTo: null, ok: true, skipped: true };
  }

  try {
    if (!account) {
      throw new Error("Žádný připojený Google účet pro tohoto uživatele.");
    }
    if (!recipientEmail) {
      throw new Error("Není nastaven příjemce ranního reportu.");
    }

    const report = await buildMorningReport();
    await sendGmailMessage(account.token, {
      to: recipientEmail,
      subject: report.subject,
      body: report.text,
      html: report.html,
    });

    await markTaskRun(task.id, task.schedule_time, task.timezone, task.schedule_days);
    const meta = {
      subject: report.subject,
      totalLeads: report.totalLeads,
      incompleteCount: report.incompleteCount,
      listingCount: report.listingCount,
    };
    await updateRunRecord(supabase, runId, "success", meta);
    return { taskId: task.id, taskType: task.task_type, sentTo: recipientEmail, ok: true, meta };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updateRunRecord(supabase, runId, "failed", {}, errorMessage);
    return { taskId: task.id, taskType: task.task_type, sentTo: null, ok: false, error: errorMessage };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function runDueTasks(): Promise<{ processed: number; skipped: number; failed: number; results: RunResult[] }> {
  const tasks = await getDueScheduledTasks();
  if (tasks.length === 0) return { processed: 0, skipped: 0, failed: 0, results: [] };

  const supabase = createSupabaseServiceClient();
  const results: RunResult[] = [];

  for (const task of tasks) {
    let result: RunResult;
    if (task.task_type === "market_digest") {
      result = await runMarketDigest(supabase, task);
    } else if (task.task_type === "morning_report") {
      result = await runMorningReport(supabase, task);
    } else {
      result = { taskId: task.id, taskType: task.task_type, sentTo: null, ok: false, error: `Unknown task type: ${task.task_type}` };
    }
    results.push(result);
  }

  return {
    processed: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const summary = await runDueTasks();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
