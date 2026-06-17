# Zizka Real Estate Agent — Context for Codex

## Projekt

Back Office Operations Agent pro realitní firmu. Pepa (back office manager) zadává příkazy přes chat — agent analyzuje data, píše emaily, čte kalendář, generuje reporty a automaticky monitoruje realitní trh.

**Produkce:** https://zizka-amber.vercel.app  
**GitHub:** https://github.com/MIRIS888/zizka-real-estate-agent (private)  
**Supabase:** `dcyfzajomhbbquzpxgub`

---

## Stack

- Next.js 16 App Router + TypeScript strict
- Gemini 2.5 Flash — AI planner + response generator
- Supabase (PostgreSQL + Auth + RLS)
- Firecrawl API v2 — scraping českých realitních portálů
- Google OAuth 2.0 — Gmail + Calendar
- Vercel (Hobby) — deploy + cron (max 1x denně)

---

## Architektura

```
/api/chat → run-agent.ts:
  1. Gemini planner → vybere tool + parsuje input
  2. Tool handler → volá Supabase / Firecrawl / Google API
  3. Gemini response → generuje českou odpověď
  4. ChatResponse → UI

Vercel Cron (06:00 UTC denně):
  /api/cron/morning-report  → ranní report → Gmail (Po–Pá)
  /api/cron/dispatcher      → čte market_watch_rules → Firecrawl → Gmail
```

---

## Klíčové soubory

```
src/lib/agent/run-agent.ts              # hlavní agent dispatch
src/lib/gemini/client.ts                # Gemini, PLANNER_INSTRUCTION
src/lib/contracts/tools.ts              # Zod schemas pro tool inputs
src/lib/tools/market-search.ts          # Firecrawl search
src/lib/tools/market-watch-schedule.ts  # market_watch_rules CRUD + getActiveRulesForNow
src/lib/tools/morning-report.ts         # builder ranního reportu
src/lib/google/oauth.ts                 # Gmail send + Calendar FreeBusy
src/lib/google/token-store.ts           # načtení Google tokenu z Supabase
src/lib/cron/auth.ts                    # isCronAuthorized (Bearer CRON_SECRET)
src/app/api/cron/dispatcher/route.ts    # market watch dispatcher
src/app/api/cron/morning-report/route.ts
src/app/api/chat/route.ts
supabase/migrations/                    # všechny migrace (aplikovány)
vercel.json                             # cron schedule
```

---

## ENV proměnné (všechny nastavené lokálně i na Vercelu)

```
DATA_SOURCE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://dcyfzajomhbbquzpxgub.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEFAULT_ORGANIZATION_ID=f8299fa9-568f-41d1-acbb-dbcad5c499e6
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback  (lokálně)
FIRECRAWL_API_KEY=...
FIRECRAWL_API_URL=https://api.firecrawl.dev/v2
CRON_SECRET=...
```

---

## Pravidla kódu

- TypeScript strict — žádné `any`, Zod pro validaci
- Immutable updates — žádná mutace
- Chyby: `throw new Error(message)` s catch na API boundary
- Kód + komentáře v angličtině, UI text / odpovědi agenta v češtině
- Žádné console.log v produkci

---

## Supabase tabulky

`organizations`, `organization_members`, `clients`, `leads`, `properties`, `tasks`,
`agent_runs`, `tool_calls`, `market_watch_rules`, `market_digest_runs`,
`market_listings`, `daily_report_runs`, `google_accounts`

RLS zapnuté všude. Cron a agent používají `SUPABASE_SERVICE_ROLE_KEY`.

---

## Demo prompty (6 scénářů)

```
Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?
Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.
Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.
Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách.
Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.
Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.
```
