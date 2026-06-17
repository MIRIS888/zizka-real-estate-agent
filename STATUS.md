# Stav projektu — Zizka Real Estate Agent
_Aktualizováno: 2026-06-17_

## Co je to za projekt

Back Office Operations Agent pro realitní firmu. Next.js + Gemini + Supabase.
Produkce: https://zizka-amber.vercel.app

---

## Architektura

```
Chat UI → /api/chat → Gemini agent → tool handlers
                                   ├── Google Calendar (OAuth cookie)
                                   ├── Gmail send (OAuth cookie)
                                   ├── Firecrawl search
                                   └── Supabase / demo data

Vercel Cron (06:00 UTC = 08:00 Praha, Po–Pá)
  └── /api/cron/morning-report → Firecrawl + interní data → Gmail
```

---

## API endpointy

### Chat
| Endpoint | Metoda | Stav |
|---|---|---|
| `/api/chat` | POST | ✅ funguje |

### Google OAuth
| Endpoint | Metoda | Co dělá | Stav |
|---|---|---|---|
| `/api/auth/google/start` | GET | Spustí OAuth flow | ✅ |
| `/api/auth/google/callback` | GET | Zpracuje kód, uloží token do cookie + Supabase | ✅ |
| `/api/auth/google/status` | GET | Info o připojení | ✅ |
| `/api/auth/google/disconnect` | POST | Smaže token | ✅ |

### Vercel Cron
| Endpoint | Metoda | Schedule | Co dělá | Stav |
|---|---|---|---|---|
| `/api/cron/morning-report` | GET | `0 6 * * 1-5` (08:00 Praha) | Sestaví report, pošle Gmail | ✅ kód hotov |

Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel posílá automaticky)

---

## Chat nástroje (tools)

| Tool | Trigger v chatu | Stav |
|---|---|---|
| `query_lead_metrics` | Nové klienty, leady, odkud přišli... | ✅ |
| `query_sales_metrics` | Graf leadů a prodejů | ✅ |
| `find_incomplete_properties` | Chybějící data u nemovitostí | ✅ |
| `find_calendar_slots` | Volné termíny v kalendáři | ✅ (Google Calendar) |
| `create_email_draft` | Napiš email s termínem prohlídky | ✅ (Gmail) |
| `send_email` | Potvrzení odeslání emailu | ✅ (Gmail) |
| `create_weekly_report` | Týdenní report / 3 slidy pro vedení | ✅ |
| `send_morning_report` | "Pošli mi ranní report" | ✅ (Gmail, Firecrawl) |
| `watch_market` | Monitoring nemovitostí v lokalitě | ✅ (Firecrawl live search) |

---

## Ranní report — obsah

Email odesílaný každé ráno nebo na vyžádání z chatu:
- **Interní přehled** — nové leady (7 dní), nemovitosti k doplnění
- **Nabídky v Praze** — top 5 ze Sreality, Bezrealitky, RE/MAX atd. (pouze prodej)

---

## ENV proměnné

| Proměnná | Lokálně | Vercel | Poznámka |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ | ✅ | |
| `GEMINI_MODEL` | ✅ | ✅ | gemini-2.5-flash |
| `DATA_SOURCE` | `local` | `local` | změnit na `supabase` pro reálné ukládání |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | |
| `DEFAULT_ORGANIZATION_ID` | ✅ | ✅ | |
| `CRON_SECRET` | ✅ (dev) | ❌ chybí | **nastavit na Verceli** |
| `GOOGLE_CLIENT_ID` | ✅ | ✅ | |
| `GOOGLE_CLIENT_SECRET` | ✅ | ✅ | |
| `FIRECRAWL_API_KEY` | ✅ | ✅ | rotovat před veřejným demem |
| `FIRECRAWL_API_URL` | ✅ | ✅ | |

---

## Supabase migrace (všechny aplikovat)

| Soubor | Co přidává |
|---|---|
| `202606150001_initial_schema.sql` | Základní schéma |
| `202606150002_market_digest_storage.sql` | market_digest_runs, market_listings |
| `202606160001_daily_report_runs.sql` | daily_report_runs |
| `202606170001_market_watch_schedule.sql` | Sloupce pro scheduling |
| `202606170002_google_accounts.sql` | google_accounts (refresh token pro cron) |

---

## Co funguje ✅

- Chat + Gemini agent, všech 6 demo scénářů
- Google OAuth (přihlášení, odpojení, Calendar, Gmail)
- Po přihlášení Google se refresh token uloží do Supabase → cron ho použije
- Firecrawl live search nemovitostí (pouze prodej)
- Ranní report — builder + Gmail odesílání (HTML email)
- Vercel Cron scheduler (vercel.json) — Po–Pá 08:00 Praha
- Build, lint, typecheck čisté

## Co ještě chybí ❌

1. **CRON_SECRET na Verceli** — nastavit v Vercel env vars
2. **Supabase migrace aplikovat** — zejména `202606170002_google_accounts.sql`
3. **DATA_SOURCE=supabase na Verceli** — pro reálné ukládání dat
4. **Google OAuth callback URL** — přidat `https://zizka-amber.vercel.app/api/auth/google/callback` do Google Cloud Console (Authorized redirect URIs)
5. **gmail.send scope** — přidat do OAuth consent screen v Google Cloud Console pokud ještě není
6. **Rotovat Firecrawl API key** — byl viděn v chatu

---

## Vercel — co nastavit

1. Jdi na Vercel Dashboard → zizka-amber → Settings → Environment Variables
2. Přidej:
   ```
   CRON_SECRET = <vygeneruj náhodný 32-char string>
   DATA_SOURCE = supabase
   ```
3. Redeploy

Vercel automaticky volá cron s `Authorization: Bearer <CRON_SECRET>` — není potřeba nic dalšího konfigurovat.
