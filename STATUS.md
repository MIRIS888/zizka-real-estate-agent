# Stav projektu — Zizka Real Estate Agent
_Aktualizováno: 2026-06-17_

## Aktualizace MVP demo — 2026-06-17

- Přidán stabilní endpoint `POST /api/agent`; `POST /api/chat` zůstává kompatibilní.
- Aktuální runtime používá nativní Gemini function calling; deterministická větev `src/lib/agent/deterministic-agent.ts` už není zapojená.
- Lokální seed data v `src/lib/local-data/seed.ts` nyní obsahují entity `clients`, `leads`, `properties`, `viewings`, `deals`, `tasks`, kalendářní sloty a mock realitní nabídky.
- UI zobrazuje více tabulek/grafů v jedné odpovědi a sekci `Generated outputs` pro CSV/Markdown/text exporty.
- Nové předávací dokumenty: `docs/AUDIT.md`, `docs/AGENT_SETUP.md`, `docs/DEMO_SCRIPT.md`, aktualizovaný `README.md`.
- Nové skripty: `npm run seed:local`, `npm run validate:demo`.

Poznámka: `GEMINI_API_KEY` je pro dotazy povinný. `DATA_SOURCE=local` stále používá lokální data v tools, ale rozhodování o volání funkcí dělá Gemini function calling.

## Produkce

- **URL:** https://zizka-amber.vercel.app
- **GitHub:** https://github.com/MIRIS888/zizka-real-estate-agent
- **Supabase:** dcyfzajomhbbquzpxgub (ACTIVE_HEALTHY, eu-west-1)
- **Data source:** `supabase` (produkce i lokálně)

---

## Co funguje ✅

- Chat + Gemini agent (všech 6 demo scénářů)
- Google OAuth — přihlášení, Calendar FreeBusy, Gmail send
- Firecrawl live search na CZ realitních portálech (pouze prodej)
- Ranní report — builder + Gmail (HTML email)
- Market watch dispatcher — Pepa řekne "sleduj Holešovice každé ráno" → agent uloží pravidlo → každý den v 6:00 UTC pošle email s nabídkami
- Vercel Cron: `morning-report` (Po–Pá 6 UTC) + `dispatcher` (denně 6 UTC)
- Supabase: všechny migrace aplikované, včetně `last_run_at`
- ENV vars: všechny nastavené lokálně i na Vercelu

---

## Aktivní market watch pravidla

| Lokalita | Dny | Email | Naposledy |
|---|---|---|---|
| Praha Holešovice | každý den | mirdapizuris@gmail.com | nikdy (spustí se zítra) |

---

## Co ještě chybí / TODO

1. **Vercel env vars potvrdit** — zejména `DATA_SOURCE=supabase` a `CRON_SECRET` na produkci
2. **Google OAuth redirect URI** — přidat produkční URL do Google Cloud Console
3. **Seed dat do Supabase** — tabulky jsou prázdné, demo scénáře jedou z local seed dat
4. **Demo video** — nahrát krátké video s 6 scénáři

---

## Architektura

```
Chat → /api/agent → Gemini function calling → tool handler → functionResponse → Gemini odpověď
Vercel Cron 06:00 UTC:
  morning-report (Po–Pá) → Firecrawl + DB → Gmail
  dispatcher (denně)     → market_watch_rules → Firecrawl → Gmail
```
