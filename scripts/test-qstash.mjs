/**
 * QStash end-to-end integration test.
 * Usage: npm run test:qstash
 *
 * What this does:
 *   1. Verifies all required env vars are present
 *   2. Creates a real one_time scheduled_task in Supabase (task_type=market_digest, Praha - Žižkov)
 *      with next_run_at = now + DELAY_MINUTES
 *   3. Schedules a QStash trigger for that time
 *   4. Prints the QStash message ID and a checklist to verify delivery
 *   5. Cleans up the test task unless --keep flag is passed
 *
 * Requirements:
 *   .env.local with QSTASH_URL, QSTASH_TOKEN, APP_URL, CRON_SECRET,
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEFAULT_ORGANIZATION_ID
 *
 * NEVER outputs QSTASH_TOKEN, CRON_SECRET, or SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DELAY_MINUTES = 7;
const TEST_LOCATION = "Praha - Žižkov (QStash test)";
const ARGS = process.argv.slice(2);
const KEEP = ARGS.includes("--keep");
const DRY_RUN = ARGS.includes("--dry");

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

loadDotEnv();

function require_env(name) {
  const v = process.env[name];
  if (!v) { console.error(`❌  ${name} is not set.`); process.exit(1); }
  return v;
}

const QSTASH_URL   = require_env("QSTASH_URL");
const QSTASH_TOKEN = require_env("QSTASH_TOKEN");
const APP_URL      = require_env("APP_URL").replace(/\/$/, "");
const CRON_SECRET  = require_env("CRON_SECRET");
const SB_URL       = require_env("NEXT_PUBLIC_SUPABASE_URL");
const SB_KEY       = require_env("SUPABASE_SERVICE_ROLE_KEY");
// DEFAULT_ORGANIZATION_ID required but not in scheduled_tasks schema — verify env is complete
require_env("DEFAULT_ORGANIZATION_ID");

const TARGET_URL = `${APP_URL}/api/cron/run-due-tasks`;
const supabase = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

async function getTestUser() {
  const { data } = await supabase.auth.admin.listUsers();
  const users = data?.users ?? [];
  if (users.length === 0) throw new Error("No users found in Supabase Auth.");
  return users[0];
}

async function createTestTask(userId, runAt) {
  const scheduleTime = runAt.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(":", ":");

  const { data, error } = await supabase
    .from("scheduled_tasks")
    .insert({
      user_id: userId,
      task_type: "market_digest",
      params: {
        location: TEST_LOCATION,
        locationQuery: TEST_LOCATION,
        transaction: "sale",
      },
      schedule_kind: "one_time",
      run_once: true,
      schedule_time: scheduleTime,
      schedule_days: null,
      timezone: "Europe/Prague",
      is_active: true,
      next_run_at: runAt.toISOString(),
    })
    .select("id, next_run_at")
    .single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);
  return data;
}

async function scheduleQStash(runAt, taskId) {
  const notBefore = Math.floor(runAt.getTime() / 1000);
  // QStash requires destination URL raw in path — encodeURIComponent breaks scheme detection.
  const response = await fetch(`${QSTASH_URL}/v2/publish/${TARGET_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${QSTASH_TOKEN}`,
      "Content-Type": "application/json",
      "Upstash-Not-Before": String(notBefore),
      "Upstash-Retries": "2",
      "Upstash-Forward-Authorization": `Bearer ${CRON_SECRET}`,
      "Upstash-Message-Id": `qstash-test-${taskId}`,
    },
    body: JSON.stringify({ source: "qstash_test", taskId }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`QStash API error ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function deleteTestTask(taskId) {
  await supabase.from("scheduled_tasks").delete().eq("id", taskId);
}

async function checkTaskStatus(taskId) {
  const { data } = await supabase
    .from("scheduled_tasks")
    .select("id, is_active, completed_at, last_run_at, next_run_at")
    .eq("id", taskId)
    .single();
  return data;
}

async function checkTaskRuns(taskId) {
  const { data } = await supabase
    .from("scheduled_task_runs")
    .select("id, status, started_at, finished_at, error_message, idempotency_key")
    .eq("task_id", taskId)
    .order("started_at", { ascending: false });
  return data ?? [];
}

async function run() {
  console.log("\n=== QStash E2E Integration Test ===\n");

  if (DRY_RUN) {
    console.log("Dry run — verifying env only, skipping DB/QStash calls.\n");
    console.log(`  QSTASH_URL:    ✅ ${QSTASH_URL}`);
    console.log(`  QSTASH_TOKEN:  ✅ set`);
    console.log(`  APP_URL:       ✅ ${APP_URL}`);
    console.log(`  CRON_SECRET:   ✅ set`);
    console.log(`  TARGET_URL:    ${TARGET_URL}`);
    console.log("\nDry run complete.\n");
    return;
  }

  // 1. Get user
  console.log("1. Finding test user...");
  const user = await getTestUser();
  console.log(`   user_id: ${user.id.slice(0, 8)}…\n`);

  // 2. Calculate run time
  const runAt = new Date(Date.now() + DELAY_MINUTES * 60 * 1000);
  const localRunAt = runAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
  console.log(`2. Test task will run at: ${localRunAt} Prague (UTC: ${runAt.toISOString()})\n`);

  // 3. Create task in DB
  console.log("3. Creating one_time scheduled_task in DB...");
  let task;
  try {
    task = await createTestTask(user.id, runAt);
    console.log(`   task_id:     ${task.id}`);
    console.log(`   next_run_at: ${task.next_run_at}\n`);
  } catch (err) {
    console.error(`❌  DB task creation failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Schedule QStash message
  console.log(`4. Scheduling QStash trigger → ${TARGET_URL}`);
  let qstashResult;
  try {
    qstashResult = await scheduleQStash(runAt, task.id);
    console.log(`   ✅ QStash message scheduled`);
    console.log(`   messageId: ${qstashResult.messageId ?? "(not returned)"}`);
    console.log(`   scheduled: ${localRunAt} Prague\n`);
  } catch (err) {
    console.error(`❌  QStash scheduling failed: ${err.message}`);
    if (!KEEP) await deleteTestTask(task.id);
    process.exit(1);
  }

  // 5. Print checklist
  console.log("5. Checklist — verify after the scheduled time:\n");
  console.log(`   a) Upstash Console → QStash → Messages`);
  console.log(`      → Look for messageId: ${qstashResult.messageId ?? "(check console)"}`);
  console.log(`      → Target: ${TARGET_URL}`);
  console.log(`      → Should show: DELIVERED / SUCCESS after ${localRunAt}`);
  console.log();
  console.log(`   b) Supabase → scheduled_task_runs`);
  console.log(`      → task_id = ${task.id}`);
  console.log(`      → status should be: success (or skipped if already ran)`);
  console.log();
  console.log(`   c) Supabase → scheduled_tasks`);
  console.log(`      → id = ${task.id}`);
  console.log(`      → is_active should be: false`);
  console.log(`      → completed_at should be: not null`);
  console.log();
  console.log(`   d) Email`);
  console.log(`      → Check inbox for "Realitní přehled – ${TEST_LOCATION}"`);
  console.log();

  if (KEEP) {
    console.log(`Task kept in DB (--keep flag). To check later:\n  npm run test:qstash:check -- ${task.id}\n`);
  } else {
    console.log("Waiting 10 seconds, then checking task status once...");
    await new Promise((r) => setTimeout(r, 10000));
    const status = await checkTaskStatus(task.id);
    const runs = await checkTaskRuns(task.id);
    console.log(`\nImmediate check (before QStash fires):`);
    console.log(`  task.is_active:   ${status?.is_active}`);
    console.log(`  task.completed_at: ${status?.completed_at ?? "null (expected — not fired yet)"}`);
    console.log(`  runs recorded:    ${runs.length} (expected 0 — not fired yet)`);
    console.log(`\nLeave the task in DB for QStash delivery. Re-run with --keep to skip deletion.\n`);
    // Don't delete — leave for QStash to fire
  }

  console.log("=== Test scheduled. Monitor QStash console and DB after the scheduled time. ===\n");
}

run().catch((err) => {
  console.error("❌  test-qstash failed:", err.message);
  process.exit(1);
});
