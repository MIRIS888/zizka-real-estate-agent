# Stav projektu — Zizka Real Estate Agent
_Aktualizováno: 2026-06-17_

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
Chat → /api/chat → Gemini → tool handler → Supabase / Firecrawl / Google
Vercel Cron 06:00 UTC:
  morning-report (Po–Pá) → Firecrawl + DB → Gmail
  dispatcher (denně)     → market_watch_rules → Firecrawl → Gmail
```
