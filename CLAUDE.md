# Zizka Real Estate Agent — Context for Claude Code

## Co je to za projekt

Back Office Operations Agent pro realitní firmu. Pepa (back office manager) komunikuje s agentem přes chat — agent zvládá analytiku, emaily, kalendář, reporty a sledování realitního trhu.

**Produkce:** https://zizka-amber.vercel.app  
**GitHub:** https://github.com/MIRIS888/zizka-real-estate-agent  
**Supabase projekt:** `dcyfzajomhbbquzpxgub` (region eu-west-1)

---

## Stack

- **Frontend/Backend:** Next.js 16 App Router, TypeScript strict
- **AI:** Gemini 2.5 Flash (`@google/genai`) — planner + tool response
- **DB:** Supabase (PostgreSQL) — RLS zapnuté, service role pro cron/agent
- **Scraping:** Firecrawl API v2 — search přes české realitní portály
- **Email/Kalendář:** Google OAuth 2.0 — Gmail API + Calendar FreeBusy
- **Deployment:** Vercel (Hobby plán — max 1x denně cron)
- **Auth:** Supabase Auth (login přes email/heslo)

---

## Architektura

```
Chat UI → /api/chat → run-agent.ts → Gemini (planner)
                                   → tool handler → výsledek
                                   → Gemini (tool response) → UI

Vercel Cron (06:00 UTC = 08:00 Praha)
  ├── /api/cron/morning-report  → Po–Pá: report + Gmail
  └── /api/cron/dispatcher      → každý den: čte market_watch_rules → Firecrawl → Gmail
```

---

## Klíčové soubory

| Soubor | Co dělá |
|---|---|
| `src/lib/agent/run-agent.ts` | Hlavní agent — planner → tool dispatch → response |
| `src/lib/gemini/client.ts` | Gemini klient, PLANNER_INSTRUCTION (seznam toolů + pravidla) |
| `src/lib/contracts/tools.ts` | Zod schemas pro všechny tool inputs + AgentPlan |
| `src/lib/tools/market-search.ts` | Firecrawl search přes CZ realitní portály |
| `src/lib/tools/market-watch-schedule.ts` | Upsert/čtení market watch pravidel, getActiveRulesForNow |
| `src/lib/tools/morning-report.ts` | Builder ranního reportu (HTML email) |
| `src/lib/google/oauth.ts` | Gmail send, Calendar FreeBusy |
| `src/lib/google/token-store.ts` | Načtení Google tokenu z Supabase (pro cron) |
| `src/lib/cron/auth.ts` | Sdílená `isCronAuthorized` pro cron routes |
| `src/app/api/cron/dispatcher/route.ts` | Market watch dispatcher |
| `src/app/api/cron/morning-report/route.ts` | Ranní report cron |
| `src/app/api/chat/route.ts` | Chat API endpoint |
| `supabase/migrations/` | Všechny DB migrace (aplikovat v pořadí) |

---

## Chat nástroje (tools)

| Tool | Kdy agent použije |
|---|---|
| `query_lead_metrics` | Nové klienty, leady, odkud přišli |
| `query_sales_metrics` | Graf leadů a prodejů |
| `find_incomplete_properties` | Chybějící data u nemovitostí |
| `find_calendar_slots` | Volné termíny v Google Calendar |
| `create_email_draft` | Email + doporučený termín prohlídky |
| `send_email` | Odeslání potvrzeného emailu přes Gmail |
| `create_weekly_report` | Týdenní report / 3 slidy pro vedení |
| `send_morning_report` | Ranní report na email |
| `watch_market` | Nastaví/aktualizuje monitoring nemovitostí |

---

## ENV proměnné

Všechny jsou nastavené v `.env.local` (lokálně) i na Vercelu.

| Proměnná | Hodnota / poznámka |
|---|---|
| `DATA_SOURCE` | `supabase` (produkce i lokálně) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dcyfzajomhbbquzpxgub.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | viz `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | viz `.env.local` — pouze server |
| `DEFAULT_ORGANIZATION_ID` | `f8299fa9-568f-41d1-acbb-dbcad5c499e6` |
| `GEMINI_API_KEY` | viz `.env.local` |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `GOOGLE_CLIENT_ID` | viz `.env.local` |
| `GOOGLE_CLIENT_SECRET` | viz `.env.local` |
| `GOOGLE_REDIRECT_URI` | lokálně: `http://localhost:3000/api/auth/google/callback` |
| `FIRECRAWL_API_KEY` | viz `.env.local` |
| `FIRECRAWL_API_URL` | `https://api.firecrawl.dev/v2` |
| `CRON_SECRET` | viz `.env.local` — Vercel posílá jako Bearer token |

---

## Supabase schéma (tabulky)

- `organizations`, `organization_members` — multi-tenant základ
- `clients`, `leads`, `properties`, `tasks` — CRM data
- `agent_runs`, `tool_calls` — log agentích akcí
- `market_watch_rules` — pravidla pro monitoring (location, schedule_days, schedule_time, timezone, recipient_email, last_run_at)
- `market_digest_runs`, `market_listings` — výsledky scrapingu
- `daily_report_runs` — log ranních reportů
- `google_accounts` — OAuth tokeny pro cron (refresh token)

Všechny migrace jsou v `supabase/migrations/` a jsou aplikované.

---

## Vercel Cron

```json
{ "path": "/api/cron/morning-report", "schedule": "0 6 * * 1-5" }
{ "path": "/api/cron/dispatcher",     "schedule": "0 6 * * *"   }
```

Hobby plán = max 1x denně. Dispatcher běží každý den v 6:00 UTC, kontroluje `schedule_days` (ISO weekday 1=Po, 7=Ne).

---

## Demo scénáře (6 povinných)

```
Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?
Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.
Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.
Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách.
Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.
Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.
```

---

## Konvence

- TypeScript strict — žádné `any`
- Zod pro všechny vstupy toolů i API responses
- Immutable updates — žádná mutace objektů
- Chyby: `throw new Error(message)` — catch na hranicích (API routes)
- Žádné console.log v produkčním kódu
- Komunikace s uživatelem: česky; kód, komentáře, proměnné: anglicky
