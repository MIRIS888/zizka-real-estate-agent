# Audit Back Office Operations Agenta

## Aktuální stav (2026-06-18)

- Framework: Next.js 16, React 19, TypeScript, App Router.
- Frontend: jedna hlavní chat aplikace v `src/components/agent-chat.tsx`, Recharts pro grafy, Markdown rendering pro odpovědi.
- Backend: API route `POST /api/chat` (re-exportovaná jako `POST /api/agent`).
- Data: Supabase migrace existují a jsou aplikované. `DATA_SOURCE=supabase` v produkci.
- AI vrstva: všechny dotazy jdou přes Gemini native function calling; deterministický agent zůstává v repozitáři, ale není zapojený v runtime.
- Integrace: Google Calendar/Gmail (OAuth 2.0) a Firecrawl jsou plně provozní s env klíči.

## Calendar tools — aktuální stav ✅

Všechny čtyři calendar tools jsou plně implementované:

| Tool | Gemini declaration | Zod schema | run-agent handler | Google API | Confirmation guard |
|---|---|---|---|---|---|
| `find_calendar_events` | ✅ | ✅ | ✅ | ✅ findGoogleCalendarEvents | Read-only |
| `create_calendar_event` | ✅ | ✅ | ✅ | ✅ createGoogleCalendarEvent | ✅ HMAC token |
| `update_calendar_event` | ✅ | ✅ | ✅ | ✅ updateGoogleCalendarEvent | ✅ HMAC token |
| `delete_calendar_event` | ✅ | ✅ | ✅ | ✅ deleteGoogleCalendarEvent | ✅ HMAC token |

- `create_calendar_event` a `update_calendar_event` mají backend guard odmítající termíny v minulosti.
- `delete_calendar_event` správně ošetřuje Google Calendar `204 No Content`.
- Všechny časy jsou v `Europe/Prague` přes RFC3339 s UTC offsetem.

## Bezpečnostní vylepšení (2026-06-18)

### Confirmation guard — HMAC token

Původní problém: potvrzení se odvozovalo z historii chatu heuristicky. Jakékoliv "ano" po zprávě s "potvr" mohlo spustit write akci.

Nové řešení: serverový HMAC-SHA256 token v `src/lib/agent/confirmation-token.ts`.

Flow:
1. Gemini zavolá write/destructive tool.
2. Server vygeneruje HMAC token pro `{userId, toolName, hash(payload), exp: now+10min}`.
3. Server vrátí uživateli potvrzovací zprávu + `confirmationToken` + `pendingTool`.
4. UI uloží token a pendingTool do React state.
5. Uživatel potvrdí ("ano vytvoř" apod.).
6. UI odešle `{message, confirmationToken, pendingTool}`.
7. Server ověří: HMAC podpis, expirace, userId, toolName, hash(payload).
8. Server provede přesně uložený tool payload.

Pokud `HMAC_SECRET` nebo `CRON_SECRET` není nastavený, token se negeneruje. Token musí odpovídat přesnému payloadu — nelze potvrdit jinou akci než tu, která byla zobrazena.

### Cron auth — CRON_SECRET povinný v produkci

Původní problém: pokud `CRON_SECRET` nebyl nastaven, endpointy fallbackovaly na `x-vercel-cron: 1`.

Nové chování (`src/lib/cron/auth.ts`):
- `CRON_SECRET` nastaven → vyžaduje `Authorization: Bearer <CRON_SECRET>`
- `CRON_SECRET` není nastaven + `NODE_ENV=production` → vrátí 401 (endpoint se nespustí)
- `CRON_SECRET` není nastaven + dev → fallback na `x-vercel-cron: 1` (lokální testování)

**Na Vercelu musí být `CRON_SECRET` nastaven.** Vercel Cron ho posílá automaticky.

### Rate limiting na /api/chat

Nový modul `src/lib/agent/rate-limiter.ts` s in-memory limitem.

- 20 požadavků za minutu per userId (nebo IP jako fallback).
- Rate limit se aplikuje před voláním Gemini — nespotřebovává tokeny při překročení.
- Při překročení: `429 Too Many Requests` s českou zprávou a `Retry-After` hlavičkou.
- In-memory store (platný per Vercel instance) — pro produkci s více instancemi zvážit Upstash Redis.

## Zbývající priority před prezentací

1. Ověřit, že `CRON_SECRET` a `HMAC_SECRET` (nebo `CRON_SECRET` jako fallback) jsou nastaveny na Vercelu.
2. Pro HMAC tokeny: buď nastavit `HMAC_SECRET` jako dedikovaný klíč, nebo využít existující `CRON_SECRET`.
3. Smoke test: `npm run lint && npm run typecheck && npm run build`.

## Auth a historie konverzací (2026-06-18)

### Přihlášení — email + heslo
- Přidáno na přihlašovací stránce (`/login`) vedle stávajícího Google OAuth.
- Nová registrační stránka `/signup`.
- Oba způsoby přihlášení jsou plně oddělené od Google OAuth pro Gmail/Calendar.

### Historie konverzací — Supabase
- Tabulky `chat_threads` a `chat_messages` s RLS (uživatel vidí jen svá vlákna).
- Chat UI načítá vlákna z DB; localStorage pro vlákna byl odstraněn.
- Confirmation token nyní obsahuje `threadId` — token z jednoho vlákna nelze zneužít v jiném.
