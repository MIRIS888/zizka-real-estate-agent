/**
 * Cron / scheduled task system health diagnostic.
 * Usage: npm run diagnose:cron
 *
 * Requirements: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local or environment.
 * Never outputs access tokens, refresh tokens, or secrets.
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
  console.log(`\n=== CRON HEALTH — ${now.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })} ===\n`);

  // ── 0. Scheduler health ───────────────────────────────────────────────────
  const qstashUrl = process.env.QSTASH_URL;
  const qstashToken = process.env.QSTASH_TOKEN;
  const appUrl = process.env.APP_URL;
  const cronSecret = process.env.CRON_SECRET;
  const qstashOk = !!(qstashUrl && qstashToken && appUrl && cronSecret);
  console.log("Scheduler:");
  console.log(`  type:           ${qstashOk ? "QStash (precise one-time)" : "Vercel daily cron (batch)"}`);
  console.log(`  exact one-time: ${qstashOk ? "enabled" : "disabled"}`);
  console.log(`  QSTASH_URL:     ${qstashUrl ? `✅ ${qstashUrl}` : "❌ not set"}`);
  console.log(`  QSTASH_TOKEN:   ${qstashToken ? "✅ set" : "❌ not set — one-time tasks will run in next daily batch"}`);
  console.log(`  APP_URL:        ${appUrl ? `✅ ${appUrl}` : "❌ not set — required for QStash triggers"}`);
  console.log(`  CRON_SECRET:    ${cronSecret ? "✅ set" : "❌ not set — QStash delivery will get 401"}`);
  if (!qstashOk) {
    console.log("  ⚠️  Without all 4 vars, one-time tasks run at 08:00 Praha (Vercel daily cron), not at the scheduled minute.");
    console.log("  Missing: " + [!qstashUrl && "QSTASH_URL", !qstashToken && "QSTASH_TOKEN", !appUrl && "APP_URL", !cronSecret && "CRON_SECRET"].filter(Boolean).join(", "));
  }
  console.log();

  // ── 1. Vercel cron routes ──────────────────────────────────────────────────
  let cronRoutes = [];
  try {
    const vj = JSON.parse(readFileSync("vercel.json", "utf8"));
    cronRoutes = vj.crons ?? [];
  } catch {
    console.log("vercel.json not found or invalid\n");
  }
  console.log("Vercel cron routes (active):");
  for (const c of cronRoutes) {
    console.log(`  ${c.path.padEnd(40)} schedule: ${c.schedule}`);
  }
  const legacyEndpoints = ["/api/cron/dispatcher", "/api/cron/morning-report"];
  const legacyActive = legacyEndpoints.filter((p) => cronRoutes.some((c) => c.path === p));
  console.log("\nLegacy endpoints:");
  console.log(`  /api/cron/dispatcher      → ${legacyActive.includes("/api/cron/dispatcher") ? "⚠️  STILL IN VERCEL.JSON" : "✅ removed from vercel.json (returns 410)"}`);
  console.log(`  /api/cron/morning-report  → ${legacyActive.includes("/api/cron/morning-report") ? "⚠️  STILL IN VERCEL.JSON" : "✅ removed from vercel.json (returns 410)"}`);
  console.log();

  // ── 2. scheduled_tasks ────────────────────────────────────────────────────
  const { data: tasks, error: tErr } = await supabase
    .from("scheduled_tasks")
    .select("id, user_id, task_type, params, schedule_time, schedule_days, schedule_kind, run_once, completed_at, timezone, is_active, last_run_at, next_run_at, created_at")
    .order("task_type", { ascending: true });

  if (tErr) {
    console.error("❌  scheduled_tasks:", tErr.message);
  } else {
    const active = tasks.filter((t) => t.is_active);
    const noUserId = tasks.filter((t) => !t.user_id);
    const byUser = {};
    const byType = {};
    const byKind = {};
    for (const t of tasks) {
      byUser[t.user_id ?? "none"] = (byUser[t.user_id ?? "none"] ?? 0) + 1;
      byType[t.task_type] = (byType[t.task_type] ?? 0) + 1;
      const kind = t.schedule_kind ?? "recurring";
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    const due = tasks.filter((t) => t.is_active && new Date(t.next_run_at) <= now);
    const completed = tasks.filter((t) => t.completed_at);

    console.log("scheduled_tasks:");
    console.log(`  total:          ${tasks.length}`);
    console.log(`  active:         ${active.length}`);
    console.log(`  completed:      ${completed.length}`);
    console.log(`  due now:        ${due.length}`);
    console.log(`  without user_id:${noUserId.length}${noUserId.length > 0 ? "  ⚠️  LEGACY RISK" : "  ✅"}`);
    console.log(`  by type:        ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    console.log(`  by kind:        ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    console.log(`  by user_id:     ${Object.entries(byUser).map(([u, n]) => `${u.slice(0, 8)}…=${n}`).join(", ")}`);
    console.log();
    for (const t of tasks) {
      const loc = t.params?.location ?? "—";
      const recip = maskEmail(t.params?.recipient_email);
      const days = t.schedule_days ? `[${t.schedule_days.join(",")}]` : "all days";
      const kind = t.schedule_kind ?? "recurring";
      const stateLabel = t.completed_at ? "DONE" : t.is_active ? "ACTIVE" : "PAUSED";
      console.log(`  [${stateLabel}] ${t.task_type} (${kind})`);
      if (loc !== "—") console.log(`         location:  ${loc}`);
      console.log(`         schedule:  ${t.schedule_time} ${days} ${t.timezone}`);
      console.log(`         recipient: ${recip}`);
      console.log(`         last_run:  ${fmt(t.last_run_at)}`);
      if (kind === "one_time") {
        console.log(`         scheduled: ${fmt(t.next_run_at)}`);
        if (t.completed_at) console.log(`         completed: ${fmt(t.completed_at)}`);
      } else {
        console.log(`         next_run:  ${fmt(t.next_run_at)}`);
      }
    }
    console.log();

    // One-time tasks without QStash warning
    const pendingOneTime = tasks.filter((t) => t.schedule_kind === "one_time" && t.is_active && !t.completed_at);
    if (pendingOneTime.length > 0 && !qstashOk) {
      console.log(`⚠️  ${pendingOneTime.length} pending one-time task(s) exist but QStash is NOT configured.`);
      console.log("   These tasks will run in the next daily Vercel cron batch (08:00 Praha), not at their scheduled time.");
      console.log();
    }

    // Duplicate detection
    const seen = {};
    const dupes = [];
    for (const t of active) {
      const k = `${t.task_type}|${t.params?.location ?? ""}|${t.schedule_time}|${t.user_id}`;
      if (seen[k]) dupes.push(t);
      else seen[k] = t;
    }
    console.log("Potential duplicates:");
    if (dupes.length === 0) console.log("  ✅ none");
    else for (const d of dupes) console.log(`  ⚠️  ${d.task_type}/${d.params?.location} @ ${d.schedule_time}`);
    console.log();
  }

  // ── 3. market_watch_rules (legacy) ────────────────────────────────────────
  const { data: rules, error: rErr } = await supabase
    .from("market_watch_rules")
    .select("id, name, is_active, location_query, schedule_time, recipient_email, last_run_at")
    .order("created_at", { ascending: false });

  if (!rErr) {
    const activeRules = (rules ?? []).filter((r) => r.is_active);
    console.log("market_watch_rules (legacy system):");
    console.log(`  total:   ${(rules ?? []).length}`);
    console.log(`  active:  ${activeRules.length}${activeRules.length > 0 ? "  ⚠️  ACTIVE — may cause duplicate emails" : "  ✅ all decommissioned"}`);
    for (const r of activeRules) {
      console.log(`    ⚠️  ${r.name} @ ${r.schedule_time} → ${maskEmail(r.recipient_email)}`);
    }
    console.log();
  }

  // ── 4. google_accounts ────────────────────────────────────────────────────
  const { data: gas } = await supabase
    .from("google_accounts")
    .select("id, user_id, email, token_expires_at, updated_at")
    .order("updated_at", { ascending: false });

  console.log("google_accounts:");
  console.log(`  total:          ${(gas ?? []).length}`);
  const noUid = (gas ?? []).filter((g) => !g.user_id);
  console.log(`  without user_id:${noUid.length}${noUid.length > 0 ? "  ⚠️  should be backfilled" : "  ✅"}`);
  for (const ga of gas ?? []) {
    const expired = ga.token_expires_at && new Date(ga.token_expires_at) < now;
    console.log(`  account: ${maskEmail(ga.email)}`);
    console.log(`  user_id: ${ga.user_id?.slice(0, 8) ?? "⚠️  none"}…`);
    console.log(`  token:   ${expired ? "⚠️  EXPIRED (will refresh on next run)" : "✅ valid"} — expires ${fmt(ga.token_expires_at)}`);
  }
  console.log();

  // ── 5. scheduled_task_runs ────────────────────────────────────────────────
  const { data: runs } = await supabase
    .from("scheduled_task_runs")
    .select("id, task_id, user_id, status, started_at, finished_at, error_message, idempotency_key")
    .order("started_at", { ascending: false })
    .limit(20);

  const allRuns = runs ?? [];
  const failed = allRuns.filter((r) => r.status === "failed");
  const skipped = allRuns.filter((r) => r.status === "skipped");

  console.log("scheduled_task_runs (last 20):");
  console.log(`  total shown: ${allRuns.length}`);
  console.log(`  failed:      ${failed.length}`);
  console.log(`  skipped:     ${skipped.length}`);
  if (allRuns.length === 0) {
    console.log("  (no runs recorded yet)");
  } else {
    for (const r of allRuns.slice(0, 10)) {
      const icon = r.status === "success" ? "✅" : r.status === "failed" ? "❌" : r.status === "skipped" ? "⏭️" : "🔄";
      console.log(`  ${icon} ${r.status.padEnd(8)} ${fmt(r.started_at)}`);
      if (r.error_message) console.log(`           error: ${r.error_message.slice(0, 80)}`);
    }
  }
  console.log();

  // ── 6. daily_report_runs (legacy ranní report log) ────────────────────────
  const { data: druns } = await supabase
    .from("daily_report_runs")
    .select("report_date, executed_at, summary")
    .order("executed_at", { ascending: false })
    .limit(5);

  console.log("daily_report_runs (legacy morning report log, last 5):");
  if (!druns || druns.length === 0) console.log("  none recorded");
  else for (const r of druns) console.log(`  ${r.report_date} — ${fmt(r.executed_at)} — ${r.summary ?? "—"}`);
  console.log();

  console.log("=== END ===\n");
}

run().catch((err) => {
  console.error("❌  diagnose-cron failed:", err.message);
  process.exit(1);
});
