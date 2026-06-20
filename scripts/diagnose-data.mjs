/**
 * Analytics data schema diagnostic.
 * Usage: npm run diagnose:data
 *
 * Checks that clients, leads, and properties tables have the columns
 * required by query_client_metrics and query_lead_metrics tools.
 *
 * Requirements: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * in .env.local or environment.
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

loadDotEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = process.env.DEFAULT_ORGANIZATION_ID;

if (!url || !key) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY není nastaven.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const Q1_FROM = "2026-01-01";
const Q1_TO   = "2026-03-31";

const SCHEMA = {
  clients:    ["id", "organization_id", "created_at", "source", "status"],
  leads:      ["id", "organization_id", "created_at", "source", "status"],
  properties: ["id", "organization_id", "created_at", "status"],
};

async function checkColumns(tableName, requiredColumns) {
  // Try all at once (fast path)
  const { error: batchError } = await supabase
    .from(tableName)
    .select(requiredColumns.join(", "))
    .limit(0);

  if (!batchError) {
    return Object.fromEntries(requiredColumns.map((c) => [c, { exists: true }]));
  }

  // Batch failed — check individually to find which columns are missing
  const results = {};
  for (const col of requiredColumns) {
    const { error } = await supabase.from(tableName).select(col).limit(0);
    results[col] = { exists: !error, error: error?.message };
  }
  return results;
}

async function tableExists(tableName) {
  const { error } = await supabase.from(tableName).select("id").limit(0);
  if (!error) return true;
  const missing =
    error.message?.includes("relation") ||
    error.message?.includes("does not exist") ||
    error.code === "42P01";
  return !missing;
}

async function countRows(tableName, filters = {}) {
  let q = supabase.from(tableName).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) {
    q = q.eq(k, v);
  }
  const { count, error } = await q;
  if (error) return `chyba: ${error.message.slice(0, 60)}`;
  return count ?? 0;
}

async function run() {
  const now = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
  console.log(`\n=== ANALYTICS DATA DIAGNOSTIKA — ${now} ===\n`);

  console.log(`Supabase URL:    ${url}`);
  console.log(`Organization ID: ${orgId ?? "⚠️  DEFAULT_ORGANIZATION_ID není nastaven"}`);
  console.log(`Q1 rozsah:       ${Q1_FROM} – ${Q1_TO}\n`);

  let allOk = true;
  const missingColumns = [];

  for (const [table, columns] of Object.entries(SCHEMA)) {
    const exists = await tableExists(table);
    const icon = exists ? "✅" : "❌";
    console.log(`${icon} Tabulka: ${table}`);

    if (!exists) {
      console.log(`   ❌ Tabulka neexistuje nebo není přístupná přes service role.\n`);
      allOk = false;
      continue;
    }

    const colResults = await checkColumns(table, columns);
    let tableOk = true;

    for (const [col, result] of Object.entries(colResults)) {
      if (result.exists) {
        console.log(`   ✅ ${col}`);
      } else {
        console.log(`   ❌ ${col} — CHYBÍ`);
        missingColumns.push(`${table}.${col}`);
        tableOk = false;
        allOk = false;
      }
    }

    if (orgId) {
      const total = await countRows(table, { organization_id: orgId });
      console.log(`   📊 Celkem záznamů (org):  ${total}`);

      if (colResults["created_at"]?.exists) {
        // Q1 count needs created_at + organization_id
        let q = supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("created_at", `${Q1_FROM}T00:00:00.000Z`)
          .lte("created_at", `${Q1_TO}T23:59:59.999Z`);
        const { count: q1count, error: q1err } = await q;
        console.log(`   📊 Q1 2026 (${Q1_FROM}–${Q1_TO}): ${q1err ? `chyba: ${q1err.message.slice(0,50)}` : (q1count ?? 0)}`);
      }
    }

    if (!tableOk && table === "clients") {
      if (!colResults["source"]?.exists) {
        console.log(`   ⚠️  Chybí clients.source — query_client_metrics nemůže zobrazit rozpad podle zdroje.`);
        console.log(`      Agent nabídne leady jako proxy místo pádu s chybou.`);
      }
      if (!colResults["organization_id"]?.exists) {
        console.log(`   ⚠️  Chybí clients.organization_id — filtrování podle org nebude fungovat.`);
      }
    }

    console.log();
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (missingColumns.length > 0) {
    console.log("=== CHYBĚJÍCÍ SLOUPCE ===");
    for (const col of missingColumns) {
      const [t, c] = col.split(".");
      console.log(`  ❌  Chybí ${col}`);
      if (t === "clients" && c === "source")          console.log(`       → query_client_metrics groupBy='source' nebude fungovat`);
      if (t === "clients" && c === "organization_id") console.log(`       → filtrování klientů podle organizace selže`);
      if (t === "leads"   && c === "source")          console.log(`       → query_lead_metrics groupBy='source' nebude fungovat`);
      if (t === "leads"   && c === "organization_id") console.log(`       → filtrování leadů podle organizace selže`);
    }
    console.log();
  }

  if (allOk) {
    console.log("✅  Schéma analytics tabulek je v pořádku. query_client_metrics a query_lead_metrics mohou běžet.");
  } else {
    console.log("⚠️  Nalezeny problémy se schématem — viz výše.");
    console.log("    Agentní analytické nástroje mohou vracet chyby nebo prázdná data.");
  }

  console.log("\n=== END ===\n");
}

run().catch((err) => {
  console.error("❌  diagnose-data selhal:", err.message);
  process.exit(1);
});
