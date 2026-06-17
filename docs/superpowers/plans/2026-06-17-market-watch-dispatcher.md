# Market Watch Dispatcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vercel Cron dispatcher, který každou hodinu zkontroluje aktivní market watch pravidla v Supabase a pro každé, které má spustit podle dne a času, provede Firecrawl search a pošle výsledky emailem.

**Architecture:** Existující tabulka `market_watch_rules` (sloupce `schedule_days`, `schedule_time`, `timezone`, `recipient_email`) je plně dostačující — nepotřebujeme novou tabulku. Dispatcher route běží každou hodinu, porovná aktuální čas v časové zóně pravidla se `schedule_time`, zkontroluje den v týdnu, a spustí `searchMarketListings` + `sendGmailMessage`. Sloupec `last_run_at` zabrání dvojímu spuštění ve stejné hodině.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL), Firecrawl API, Gmail API (přes existující `sendGmailMessage`), Vercel Cron

## Global Constraints

- Vercel Cron běží vždy v UTC — přepočet na timezone pravidla je povinný
- ISO weekday: 1=pondělí, 7=neděle (stejná konvence jako v `schedule_days`)
- `CRON_SECRET` env var musí být přítomná — stejná autorizace jako u `morning-report`
- Žádné nové npm závislosti — `date-fns` ani `luxon` nejsou v projektu; timezone přepočet přes `Intl.DateTimeFormat`
- Data source musí být `supabase` — bez Supabase dispatcher tiše přeskočí

---

## File Map

| Soubor | Akce | Zodpovědnost |
|--------|------|--------------|
| `supabase/migrations/202606180001_market_watch_last_run.sql` | Vytvořit | Přidá `last_run_at` sloupec do `market_watch_rules` |
| `src/lib/tools/market-watch-schedule.ts` | Upravit | Přidat `getActiveRulesForNow()` a `markRuleAsRun()` |
| `src/app/api/cron/dispatcher/route.ts` | Vytvořit | Cron handler — čte pravidla, spouští search, posílá email |
| `vercel.json` | Upravit | Přidat dispatcher cron zápis (`0 * * * *`) |

---

## Task 1: DB migrace — sloupec `last_run_at`

**Files:**
- Create: `supabase/migrations/202606180001_market_watch_last_run.sql`

**Interfaces:**
- Produces: `market_watch_rules.last_run_at` (type `timestamptz`, nullable)

- [ ] **Step 1: Napsat migraci**

```sql
-- supabase/migrations/202606180001_market_watch_last_run.sql
alter table public.market_watch_rules
  add column if not exists last_run_at timestamptz;
```

- [ ] **Step 2: Aplikovat migraci**

```bash
npx supabase db push
```

Očekávaný výstup: `Applying migration 202606180001_market_watch_last_run...` bez chyby.

- [ ] **Step 3: Ověřit v Supabase Studio**

Otevři Supabase Studio → Table Editor → `market_watch_rules`. Sloupec `last_run_at` musí existovat a být nullable.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202606180001_market_watch_last_run.sql
git commit -m "feat: add last_run_at to market_watch_rules"
```

---

## Task 2: Funkce pro čtení a update pravidel

**Files:**
- Modify: `src/lib/tools/market-watch-schedule.ts`

**Interfaces:**
- Produces:
  ```ts
  getActiveRulesForNow(): Promise<ActiveMarketWatchRule[]>
  markRuleAsRun(ruleId: string): Promise<void>

  type ActiveMarketWatchRule = {
    id: string;
    locationQuery: string;
    recipientEmail: string | null;
  }
  ```

**Logika pro výběr pravidel:**
1. `is_active = true`
2. `schedule_days` obsahuje dnešní ISO weekday (1–7)
3. Aktuální hodina v `timezone` pravidla se rovná hodině v `schedule_time`
4. `last_run_at` je `null` NEBO je starší než 1 hodina (ochrana proti dvojímu spuštění)

**Timezone helper — bez knihoven:**

```ts
function getCurrentHourInTimezone(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart?.value ?? 0);
}

function getCurrentIsoWeekday(timezone: string): number {
  // Intl weekday: 0=Sun, 1=Mon, ..., 6=Sat → ISO: 1=Mon ... 7=Sun
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(new Date());
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = {
    Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekdayStr] ?? 1;
}
```

- [ ] **Step 1: Přidat typy a helper funkce do `market-watch-schedule.ts`**

Na konec souboru přidat:

```ts
export type ActiveMarketWatchRule = {
  id: string;
  locationQuery: string;
  recipientEmail: string | null;
};

function getCurrentHourInTimezone(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart?.value ?? 0);
}

function getCurrentIsoWeekday(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(new Date());
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = {
    Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekdayStr] ?? 1;
}

function ruleMatchesNow(rule: {
  schedule_days: number[] | null;
  schedule_time: string | null;
  timezone: string | null;
}): boolean {
  const timezone = rule.timezone ?? "Europe/Prague";
  const scheduleTime = rule.schedule_time ?? "08:00";
  const scheduledHour = Number(scheduleTime.split(":")[0]);
  const currentHour = getCurrentHourInTimezone(timezone);
  const currentWeekday = getCurrentIsoWeekday(timezone);
  const days = rule.schedule_days ?? [1, 2, 3, 4, 5, 6, 7];
  return currentHour === scheduledHour && days.includes(currentWeekday);
}
```

- [ ] **Step 2: Přidat `getActiveRulesForNow` export**

```ts
const ActiveRuleRowSchema = z.object({
  id: z.string().uuid(),
  location_query: z.string(),
  schedule_days: z.array(z.number()).nullable(),
  schedule_time: z.string().nullable(),
  timezone: z.string().nullable(),
  recipient_email: z.string().nullable(),
  last_run_at: z.string().nullable(),
});

export async function getActiveRulesForNow(): Promise<ActiveMarketWatchRule[]> {
  const dataSource = getDataSourceEnvironment();
  if (dataSource.DATA_SOURCE !== "supabase") return [];

  const supabase = createSupabaseServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("market_watch_rules")
    .select("id, location_query, schedule_days, schedule_time, timezone, recipient_email, last_run_at")
    .eq("is_active", true)
    .or(`last_run_at.is.null,last_run_at.lt.${oneHourAgo}`);

  if (error) throw new Error(`Failed to load market watch rules: ${error.message}`);

  return (data ?? [])
    .map((row) => ActiveRuleRowSchema.parse(row))
    .filter(ruleMatchesNow)
    .map((row) => ({
      id: row.id,
      locationQuery: row.location_query,
      recipientEmail: row.recipient_email,
    }));
}
```

- [ ] **Step 3: Přidat `markRuleAsRun` export**

```ts
export async function markRuleAsRun(ruleId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("market_watch_rules")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", ruleId);

  if (error) throw new Error(`Failed to mark rule as run: ${error.message}`);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/tools/market-watch-schedule.ts
git commit -m "feat: add getActiveRulesForNow and markRuleAsRun"
```

---

## Task 3: Dispatcher cron route

**Files:**
- Create: `src/app/api/cron/dispatcher/route.ts`

**Interfaces:**
- Consumes:
  - `getActiveRulesForNow(): Promise<ActiveMarketWatchRule[]>` z `@/lib/tools/market-watch-schedule`
  - `markRuleAsRun(id: string): Promise<void>` z `@/lib/tools/market-watch-schedule`
  - `searchMarketListings(input: unknown): Promise<{listings: Listing[]}>` z `@/lib/tools/market-search`
  - `loadGoogleAccount(): Promise<{token, email} | null>` z `@/lib/google/token-store`
  - `sendGmailMessage(token, {to, subject, body, html})` z `@/lib/google/oauth`

- [ ] **Step 1: Vytvořit soubor `src/app/api/cron/dispatcher/route.ts`**

```ts
import { NextResponse } from "next/server";

import { getActiveRulesForNow, markRuleAsRun } from "@/lib/tools/market-watch-schedule";
import { searchMarketListings } from "@/lib/tools/market-search";
import { loadGoogleAccount } from "@/lib/google/token-store";
import { sendGmailMessage } from "@/lib/google/oauth";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function buildEmailHtml(locationQuery: string, listings: { title: string; description: string; url: string; source: string }[]): string {
  const rows = listings
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee"><a href="${l.url}">${l.title}</a></td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:#666">${l.description}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:#999">${l.source}</td>
        </tr>`,
    )
    .join("");

  return `<h2>Nové nabídky – ${locationQuery}</h2>
<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
  <thead><tr>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Název</th>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Popis</th>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Zdroj</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="color:#999;font-size:12px;margin-top:16px">Automatický přehled ze Žižka Reality</p>`;
}

function buildEmailText(locationQuery: string, listings: { title: string; url: string }[]): string {
  const lines = listings.map((l) => `- ${l.title}: ${l.url}`).join("\n");
  return `Nové nabídky – ${locationQuery}\n\n${lines}\n\nAutomatický přehled ze Žižka Reality`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rules = await getActiveRulesForNow();

  if (rules.length === 0) {
    return NextResponse.json({ dispatched: 0, reason: "no rules due now" });
  }

  const account = await loadGoogleAccount();
  const results: { ruleId: string; location: string; sent: boolean; listingCount: number }[] = [];

  for (const rule of rules) {
    await markRuleAsRun(rule.id);

    const search = await searchMarketListings({ locationQuery: rule.locationQuery });
    const listings = search.listings ?? [];
    const to = rule.recipientEmail ?? account?.email ?? null;

    if (account && to) {
      await sendGmailMessage(account.token, {
        to,
        subject: `Realitní přehled – ${rule.locationQuery} (${listings.length} nabídek)`,
        body: buildEmailText(rule.locationQuery, listings),
        html: buildEmailHtml(rule.locationQuery, listings),
      });
      results.push({ ruleId: rule.id, location: rule.locationQuery, sent: true, listingCount: listings.length });
    } else {
      results.push({ ruleId: rule.id, location: rule.locationQuery, sent: false, listingCount: listings.length });
    }
  }

  return NextResponse.json({ dispatched: results.length, results });
}
```

- [ ] **Step 2: Manuálně otestovat endpoint**

Spusť dev server: `npm run dev`

Nastav v `.env.local`:
```
CRON_SECRET=test-secret-local
```

Zavolej endpoint (v terminálu):
```bash
curl -H "Authorization: Bearer test-secret-local" http://localhost:3000/api/cron/dispatcher
```

Očekávaný výstup (pokud nejsou žádná pravidla splatná teď):
```json
{"dispatched":0,"reason":"no rules due now"}
```

Nebo pokud existuje pravidlo:
```json
{"dispatched":1,"results":[{"ruleId":"...","location":"Praha Holešovice","sent":true,"listingCount":8}]}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/dispatcher/route.ts
git commit -m "feat: add market watch dispatcher cron route"
```

---

## Task 4: Zapojení do Vercel Cron

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Přidat dispatcher do `vercel.json`**

Aktuální obsah:
```json
{
  "crons": [
    {
      "path": "/api/cron/morning-report",
      "schedule": "0 6 * * 1-5"
    }
  ]
}
```

Nový obsah (přidat druhý záznam):
```json
{
  "crons": [
    {
      "path": "/api/cron/morning-report",
      "schedule": "0 6 * * 1-5"
    },
    {
      "path": "/api/cron/dispatcher",
      "schedule": "0 * * * *"
    }
  ]
}
```

`0 * * * *` = každou hodinu v UTC 00. minutě. Dispatcher sám zjistí co spustit.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: add hourly dispatcher to Vercel Cron"
```

---

## Self-Review

**Spec coverage:**
- [x] Agent uloží pravidlo do DB (existující `watch_market` tool → `upsertMarketWatchRule`)
- [x] Dispatcher čte pravidla splatná teď (`getActiveRulesForNow`)
- [x] Kontrola dne v týdnu + hodiny v správné timezone
- [x] Ochrana proti dvojímu spuštění (`last_run_at` + `markRuleAsRun`)
- [x] Firecrawl search (`searchMarketListings`)
- [x] Gmail odeslání (`sendGmailMessage`)
- [x] Vercel Cron zápis

**Gaps:** Žádné. Nová `scheduled_tasks` tabulka není potřeba — `market_watch_rules` má vše.

**Type consistency:**
- `ActiveMarketWatchRule.id` → `markRuleAsRun(ruleId: string)` ✓
- `ActiveMarketWatchRule.locationQuery` → `searchMarketListings({ locationQuery })` ✓
- `search.listings` → `buildEmailHtml(locationQuery, listings)` ✓
