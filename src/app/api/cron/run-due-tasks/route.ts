import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron/auth";
import {
  getDueScheduledTasks,
  markTaskRun,
} from "@/lib/tasks/scheduled-tasks";
import { searchMarketListings } from "@/lib/tools/market-search";
import { loadGoogleAccount } from "@/lib/google/token-store";
import { sendGmailMessage } from "@/lib/google/oauth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmailHtml(
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
  Automatický přehled ze Žižka Reality · Správa úloh v chatu aplikace.
</p>`;
}

function buildEmailText(
  location: string,
  listings: { title: string; url: string }[],
): string {
  if (listings.length === 0) {
    return `Nové nabídky – ${location}\n\nDnes nebyly nalezeny žádné nové nabídky.\n\nAutomatický přehled ze Žižka Reality`;
  }

  const lines = listings.slice(0, 10).map((l) => `- ${l.title}: ${l.url}`).join("\n");
  return `Nové nabídky – ${location}\n\n${lines}\n\nAutomatický přehled ze Žižka Reality`;
}

type TaskRunResult = {
  taskId: string;
  location: string;
  sentTo: string | null;
  listingCount: number;
  ok: boolean;
  error?: string;
};

async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

// POST: called by Vercel Cron or N8N. Processes all tasks where next_run_at <= now().
// Idempotent: each task's next_run_at advances after execution, so a repeated call
// within the same minute finds no due tasks and does nothing.
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const tasks = await getDueScheduledTasks();

    if (tasks.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, failed: 0, results: [] });
    }

    const account = await loadGoogleAccount();
    const results: TaskRunResult[] = [];

    for (const task of tasks) {
      if (task.task_type !== "market_digest") {
        results.push({
          taskId: task.id,
          location: String((task.params as { location?: unknown }).location ?? ""),
          sentTo: null,
          listingCount: 0,
          ok: false,
          error: `Neznámý typ úlohy: ${task.task_type}`,
        });
        continue;
      }

      const params = task.params as { location: string; transaction?: string; recipient_email?: string };
      const location = params.location;
      const transaction = params.transaction === "rent" ? "rent" : "sale";

      try {
        const search = await searchMarketListings({ locationQuery: location, transaction });
        const listings = search.listings ?? [];

        // Determine recipient: stored in params (set at task creation) or org account email
        const recipientEmail = params.recipient_email ?? (await getUserEmail(task.user_id)) ?? account?.email ?? null;

        if (account && recipientEmail) {
          await sendGmailMessage(account.token, {
            to: recipientEmail,
            subject: `Realitní přehled – ${location} (${listings.length} nabídek)`,
            body: buildEmailText(location, listings),
            html: buildEmailHtml(location, listings),
          });
        }

        // Always advance next_run_at regardless of whether email was sent,
        // so a missing Google account doesn't block the task forever.
        await markTaskRun(task.id, task.schedule_time, task.timezone);

        results.push({
          taskId: task.id,
          location,
          sentTo: recipientEmail,
          listingCount: listings.length,
          ok: true,
        });
      } catch (err) {
        // Log and continue — do NOT advance next_run_at so cron retries on next run
        results.push({
          taskId: task.id,
          location,
          sentTo: null,
          listingCount: 0,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const processed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({ ok: true, processed, failed, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// GET: support Vercel Cron (which sends GET requests) using the same logic
export async function GET(request: Request) {
  return POST(request);
}
