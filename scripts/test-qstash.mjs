/**
 * QStash end-to-end integration test.
 *
 * Usage:
 *   npm run test:qstash           — create task, schedule QStash, wait, verify, cleanup
 *   npm run test:qstash:dry       — env check only, no DB/QStash calls
 *   npm run test:qstash:cleanup   — delete all _test_only tasks from DB
 *
 * Test tasks use params._test_only = true so run-due-tasks skips real API calls and email.
 * NEVER outputs QSTASH_TOKEN, CRON_SECRET, or SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DELAY_MINUTES = 3;
const TEST_LOCATION = "Praha - Žižkov (QStash test)";
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry") || ARGS[0] === "dry";
const CLEANUP = ARGS.includes("--cleanup") || ARGS[0] === "cleanup";

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
        _test_only: true,  // run-due-tasks skips real API calls and email for test tasks
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
      "Upstash-Retries": "0",  // no retries for tests — one delivery is enough
      "Upstash-Forward-Authorization": `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ source: "qstash_test", taskId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`QStash API error ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function deleteTask(taskId) {
  await supabase.from("scheduled_tasks").delete().eq("id", taskId);
}

async function cleanupAllTestTasks() {
  const { data, error } = await supabase
    .from("scheduled_tasks")
    .select("id, next_run_at, is_active, completed_at")
    .filter("params->_test_only", "eq", "true");

  if (error) { console.error("❌  cleanup query failed:", error.message); return; }
  if (!data || data.length === 0) { console.log("  No _test_only tasks found."); return; }

  for (const t of data) {
    await supabase.from("scheduled_tasks").delete().eq("id", t.id);
    console.log(`  deleted: ${t.id} (active=${t.is_active}, done=${!!t.completed_at})`);
  }
  console.log(`  ${data.length} task(s) deleted.`);
}

async function checkTaskStatus(taskId) {
  const { data } = await supabase
    .from("scheduled_tasks")
    .select("id, is_active, completed_at, last_run_at")
    .eq("id", taskId)
    .single();
  return data;
}

async function checkTaskRuns(taskId) {
  const { data } = await supabase
    .from("scheduled_task_runs")
    .select("id, status, started_at, finished_at, idempotency_key")
    .eq("task_id", taskId)
    .order("started_at", { ascending: false });
  return data ?? [];
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log("\n=== QStash E2E Integration Test ===\n");

  if (DRY_RUN) {
    console.log("Dry run — env check only.\n");
    console.log(`  QSTASH_URL:    ✅ ${QSTASH_URL}`);
    console.log(`  QSTASH_TOKEN:  ✅ set`);
    console.log(`  APP_URL:       ✅ ${APP_URL}`);
    console.log(`  CRON_SECRET:   ✅ set`);
    console.log(`  TARGET_URL:    ${TARGET_URL}`);
    console.log("\nDry run complete.\n");
    return;
  }

  if (CLEANUP) {
    console.log("Cleanup mode — deleting all _test_only tasks from DB...\n");
    await cleanupAllTestTasks();
    console.log("\nDone.\n");
    return;
  }

  // 1. Get user
  console.log("1. Finding test user...");
  const user = await getTestUser();
  console.log(`   user_id: ${user.id.slice(0, 8)}…\n`);

  // 2. Calculate run time
  const runAt = new Date(Date.now() + DELAY_MINUTES * 60 * 1000);
  const localRunAt = runAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
  console.log(`2. Test task scheduled for: ${localRunAt} Prague (+${DELAY_MINUTES} min)\n`);

  // 3. Create task in DB
  console.log("3. Creating _test_only scheduled_task in DB...");
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
    console.log(`   no-retry: 0 retries configured (test mode)\n`);
  } catch (err) {
    console.error(`❌  QStash scheduling failed: ${err.message}`);
    await deleteTask(task.id);
    process.exit(1);
  }

  // 5. Wait for delivery
  const waitMs = (DELAY_MINUTES * 60 + 45) * 1000;
  const waitMin = Math.ceil(waitMs / 60000);
  console.log(`5. Waiting ${waitMin} minutes for QStash delivery...`);
  console.log(`   (Upstash Console → QStash → Messages → ${qstashResult.messageId ?? "check console"})`);

  await sleep(waitMs);

  // 6. Verify
  console.log("\n6. Verifying...");
  const status = await checkTaskStatus(task.id);
  const runs = await checkTaskRuns(task.id);

  const taskDone = status?.completed_at != null;
  const taskRan = runs.length > 0;
  const runStatus = runs[0]?.status;

  console.log(`   task.is_active:   ${status?.is_active} (expected: false)`);
  console.log(`   task.completed_at: ${status?.completed_at ?? "null"} (expected: not null)`);
  console.log(`   runs recorded:    ${runs.length} (expected: 1)`);
  if (runs[0]) console.log(`   run status:       ${runStatus} (expected: success)`);

  const passed = taskDone && taskRan && runStatus === "success";
  console.log(`\n   ${passed ? "✅ PASS" : "❌ FAIL"} — QStash delivery ${passed ? "confirmed" : "NOT confirmed"}`);

  if (!passed) {
    console.log("\n   Possible causes:");
    console.log("   - CRON_SECRET in .env.local differs from Vercel CRON_SECRET → QStash gets 401");
    console.log("   - Vercel deploy of QStash fix not yet live");
    console.log(`   - Check Upstash Console for message status: ${qstashResult.messageId ?? "see console"}`);
  }

  // 7. Cleanup
  console.log("\n7. Cleaning up test task from DB...");
  await deleteTask(task.id);
  console.log("   deleted.\n");

  console.log(`=== ${passed ? "PASS" : "FAIL"} ===\n`);
  if (!passed) process.exit(1);
}

run().catch((err) => {
  console.error("❌  test-qstash failed:", err.message);
  process.exit(1);
});
