/**
 * Diagnose cron/scheduled task system health.
 * Usage: npm run diagnose:cron
 *
 * Requirements:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local or environment.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv() {
  const envPath = ".env.local";
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

function maskEmail(email) {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return local.slice(0, 2) + "***@" + domain;
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
}

loadDotEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  const now = new Date();
  console.log("\n=== CRON HEALTH ===\n");

  // 1. Vercel cron routes
  let cronRoutes = [];
  try {
    const vj = JSON.parse(readFileSync("vercel.json", "utf8"));
    cronRoutes = vj.crons ?? [];
  } catch {
    console.log("vercel.json not found or invalid\n");
  }
  console.log("Vercel cron routes:");
  for (const c of cronRoutes) {
    console.log(`  ${c.path.padEnd(40)} schedule: ${c.schedule}`);
  }
  console.log();

  // 2. scheduled_tasks
  const { data: tasks, error: tErr } = await supabase
    .from("scheduled_tasks")
    .select("id, user_id, task_type, params, is_active, schedule_time, timezone, last_run_at, next_run_at, created_at")
    .order("created_at", { ascending: false });

  if (tErr) {
    console.error("❌  Could not query scheduled_tasks:", tErr.message);
  } else {
    const active = tasks.filter((t) => t.is_active);
    const byUser = {};
    for (const t of tasks) {
      byUser[t.user_id] = (byUser[t.user_id] ?? 0) + 1;
    }
    const due = tasks.filter((t) => t.is_active && new Date(t.next_run_at) <= now);

    console.log("scheduled_tasks:");
    console.log(`  total:          ${tasks.length}`);
    console.log(`  active:         ${active.length}`);
    console.log(`  due now:        ${due.length}`);
    console.log(`  by user_id:     ${Object.entries(byUser).map(([u, n]) => `${u.slice(0, 8)}… → ${n}`).join(", ")}`);
    console.log();

    if (tasks.length > 0) {
      console.log("  Tasks:");
      for (const t of tasks) {
        const loc = t.params?.location ?? "?";
        const recip = maskEmail(t.params?.recipient_email);
        console.log(`    [${t.is_active ? "ACTIVE" : "PAUSED"}] ${t.task_type} / ${loc}`);
        console.log(`           schedule: ${t.schedule_time} ${t.timezone}`);
        console.log(`           recipient: ${recip}`);
        console.log(`           last_run: ${fmt(t.last_run_at)}`);
        console.log(`           next_run: ${fmt(t.next_run_at)}`);
      }
      console.log();
    }

    // Duplicate detection
    const seen = {};
    const dupes = [];
    for (const t of active) {
      const key = `${t.task_type}|${t.params?.location ?? ""}|${t.schedule_time}`;
      if (seen[key]) dupes.push(t);
      else seen[key] = t;
    }
    console.log("Potential duplicates in scheduled_tasks:");
    if (dupes.length === 0) {
      console.log("  none");
    } else {
      for (const d of dupes) {
        console.log(`  ⚠️  ${d.task_type} / ${d.params?.location} @ ${d.schedule_time} (id: ${d.id})`);
      }
    }
    console.log();
  }

  // 3. market_watch_rules (legacy)
  const { data: rules, error: rErr } = await supabase
    .from("market_watch_rules")
    .select("id, name, is_active, location_query, schedule_time, recipient_email, last_run_at")
    .order("created_at", { ascending: false });

  if (!rErr) {
    const activeRules = (rules ?? []).filter((r) => r.is_active);
    console.log("market_watch_rules (legacy system):");
    console.log(`  total:   ${(rules ?? []).length}`);
    console.log(`  active:  ${activeRules.length}`);
    if (activeRules.length > 0) {
      console.log("  ⚠️  ACTIVE LEGACY RULES — these bypass user_id and the /tasks UI:");
      for (const r of activeRules) {
        console.log(`    ${r.name} @ ${r.schedule_time} → ${maskEmail(r.recipient_email)}`);
      }
    } else {
      console.log("  ✅ No active legacy rules (decommissioned correctly).");
    }
    console.log();
  }

  // 4. Google account (sender)
  const { data: ga } = await supabase
    .from("google_accounts")
    .select("email, token_expires_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log("Email sender (Google account):");
  if (!ga) {
    console.log("  ⚠️  No Google account connected — cron emails CANNOT be sent.");
  } else {
    const expired = ga.token_expires_at && new Date(ga.token_expires_at) < now;
    console.log(`  account: ${maskEmail(ga.email)}`);
    console.log(`  token:   ${expired ? "⚠️  EXPIRED (will try refresh)" : "✅ valid"} — expires ${fmt(ga.token_expires_at)}`);
  }
  console.log();

  // 5. daily_report_runs
  const { data: runs } = await supabase
    .from("daily_report_runs")
    .select("report_date, executed_at, summary")
    .order("executed_at", { ascending: false })
    .limit(5);

  console.log("Morning report runs (last 5):");
  if (!runs || runs.length === 0) {
    console.log("  none recorded");
  } else {
    for (const r of runs) {
      console.log(`  ${r.report_date} — ${r.summary ?? "—"} (sent ${fmt(r.executed_at)})`);
    }
  }
  console.log();

  console.log("=== END ===\n");
}

run().catch((err) => {
  console.error("❌  diagnose-cron failed:", err.message);
  process.exit(1);
});
