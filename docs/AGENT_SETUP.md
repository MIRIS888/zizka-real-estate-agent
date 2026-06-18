# Agent Setup

Aktualizováno: 2026-06-18

## Současné nastavení

Agent běží přes nativní Gemini function calling v balíku `@google/genai`.

Runtime cesta:

```text
Chat UI -> POST /api/agent -> runAgent -> Gemini generateContent
  -> response.functionCalls
  -> server-side tool handler
  -> functionResponse back to Gemini
  -> final natural-language answer
```

Agent už nepoužívá ručně parsovaný JSON planner jako hlavní rozhodování. Gemini dostává konverzační system prompt a deklarace funkcí. Model sám rozhoduje, kdy zavolat funkci a kdy odpovědět textem.

## Ověřená syntaxe Gemini SDK

Použitý balík:

```text
@google/genai ^2.8.0
```

Ověřeno proti lokálním typům SDK a oficiální dokumentaci Google Gemini function calling:

- `config.tools: [{ functionDeclarations: [...] }]`
- model vrací `response.functionCalls`
- výsledek funkce se vrací jako content part s `functionResponse`
- function calling mode je `FunctionCallingConfigMode.AUTO`

Oficiální dokumentace: `https://ai.google.dev/gemini-api/docs/function-calling`

## Hlavní soubory

- `src/lib/gemini/client.ts`
  - `CONVERSATIONAL_SYSTEM_INSTRUCTION`
  - `BUSINESS_FUNCTION_DECLARATIONS`
  - `createGeminiClient`
  - `getFunctionCallingConfig`
  - `createFunctionResponseContent`
  - `generateEmailDraft`

- `src/lib/agent/run-agent.ts`
  - `runAgent`
  - function-calling smyčka s limitem `MAX_AGENT_ITERATIONS = 6`
  - server-side execution pro všechny tooly
  - confirmation guard pro akce s následkem

## Dostupné funkce

Gemini má deklarované tyto funkce:

- `query_lead_metrics`
- `query_sales_metrics`
- `find_incomplete_properties`
- `find_calendar_slots`
- `find_calendar_events` — vyhledá existující události v kalendáři (read-only)
- `create_calendar_event` — vytvoří událost (vyžaduje potvrzení + HMAC token)
- `update_calendar_event` — upraví existující událost (vyžaduje potvrzení + HMAC token)
- `delete_calendar_event` — smaže existující událost (vyžaduje potvrzení + HMAC token)
- `create_email_draft`
- `send_email` — vyžaduje potvrzení + HMAC token
- `create_weekly_report`
- `send_morning_report` — vyžaduje potvrzení + HMAC token
- `watch_market` — `mode=preview` je read-only; `mode=schedule` vyžaduje potvrzení + HMAC token
- `create_scheduled_task` — vyžaduje potvrzení + HMAC token
- `list_scheduled_tasks` — read-only
- `update_scheduled_task` — vyžaduje potvrzení + HMAC token
- `delete_scheduled_task` — vyžaduje potvrzení + HMAC token

Popisy funkcí jsou v `BUSINESS_FUNCTION_DECLARATIONS`. Tyto popisy říkají modelu, kdy má funkci použít a jaké parametry vyplnit.

## Bezpečnostní pravidla

Akce s následkem se nesmí provést bez potvrzení uživatele. Potvrzení je vynuceno serverovým HMAC tokenem v `run-agent.ts`.

Consequential tools (vyžadují token):
- `send_email` — potvrzení: "ano pošli"
- `send_morning_report` — potvrzení: "ano pošli"
- `create_calendar_event` — potvrzení: "ano vytvoř"
- `update_calendar_event` — potvrzení: "ano uprav" nebo "ano přesuň"
- `delete_calendar_event` — potvrzení: "ano smaž" nebo "ano zruš"
- `watch_market` s `mode: "schedule"` — potvrzení: "ano založ"
- `create_scheduled_task` — potvrzení: "ano založ"
- `update_scheduled_task` — potvrzení: "ano uprav"
- `delete_scheduled_task` — potvrzení: "ano smaž"

Mechanismus (serverový HMAC token, od 2026-06-18):
1. Server zachytí consequential function call od Gemini.
2. Vygeneruje HMAC-SHA256 token `{userId, toolName, hash(payload), threadId, exp: now+10min}`.
3. Vrátí uživateli potvrzovací zprávu + `confirmationToken` + `pendingTool`.
4. UI uloží token v React state a přiloží ho k dalšímu požadavku.
5. Server ověří token a provede přesně uložený payload.

Prosté "ano" bez platného tokenu nespustí žádnou akci. Token musí odpovídat přesnému toolName a hash payloadu.

## Google Calendar — OAuth scopes

Pro plnou funkčnost kalendáře (čtení i zápis) jsou potřeba tyto scopes:

```text
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
```

Oba jsou zahrnuty v `SCOPES` konstantě v `src/lib/google/oauth.ts`.

Pokud měl uživatel Google účet připojený dříve (před přidáním těchto nových funkcí), **musí Google účet znovu připojit** (`/api/auth/google/start`), aby získal nové scopes s přístupem k `events.list`, `events.patch` a `events.delete`.

Stávající token bez `calendar.events` scope vrátí řízenou českou chybu — žádný crash.

## Testovací scénáře pro kalendář

Vyhledání událostí:
```text
Jaké mám dnes schůzky?
```
Očekávání: zavolá `find_calendar_events`, vrátí přehledný seznam, žádné UTC timestampy.

Úprava události:
```text
Přesuň schůzku s panem Vomáčkou na zítra v 15:00.
```
Očekávání: najde událost → připraví update → požádá o "ano uprav" → po potvrzení upraví.

Mazání události:
```text
Zruš schůzku s panem Vomáčkou.
```
Očekávání: najde událost → požádá o "ano smaž" → po potvrzení smaže.

Více kandidátů:
```text
Zruš schůzku.
```
Očekávání: pokud víc kandidátů, nevykoná delete — zeptá se na konkrétní výběr.

Termín v minulosti:
```text
Přesuň schůzku na dnes v 8:00.  (po 8:00)
```
Očekávání: odmítne, nabídne budoucí termíny.

## Market watch režimy

`watch_market` má povinný parametr:

```json
{ "mode": "preview" | "schedule" }
```

- `mode: "preview"`: jednorázově vyhledá nabídky. Nezakládá ani neaktualizuje monitoring.
- `mode: "schedule"`: založí nebo aktualizuje pravidelný monitoring. Vyžaduje předchozí potvrzení.

Příklady:

```text
Najdi nemovitosti v Holešovicích.
```

Použije `watch_market` s `mode: "preview"`.

```text
Sleduj nové nabídky v Praze Holešovicích každé ráno.
```

Nejdřív vrátí potvrzení. Po potvrzení použije `watch_market` s `mode: "schedule"`.

## Function response flags

Tool výsledky explicitně obsahují:

- `isMock`
- `isEmpty`

Model má podle system promptu tyto flagy respektovat:

- `isMock=true`: musí říct, že jde o demo/mock data.
- `isMock=false`: nesmí tvrdit, že jde o mock data.
- `isEmpty=true`: musí říct, že se nic nenašlo nebo zdroj není napojený.

## Ruční testy

Běžný datový dotaz:

```text
Kolik mám leadů za posledních 6 měsíců?
```

Očekávání: Gemini zavolá `query_lead_metrics`, odpoví česky a UI zobrazí graf.

Řetězený scénář s potvrzením:

```text
Připrav týdenní report a pošli ho vedení.
```

Očekávání: agent zavolá `create_weekly_report`, zobrazí report a požádá o potvrzení odeslání.

Potom:

```text
ano pošli
```

Očekávání: agent se pokusí zavolat `send_email`. Pokud není Google účet připojený, vrátí řízenou zprávu, že Gmail integrace není aktivní.

Market preview:

```text
Najdi nemovitosti v Holešovicích.
```

Očekávání: agent zavolá `watch_market` s `mode: "preview"` a nezaloží monitoring.

## Rate limiting

`/api/chat` má in-memory rate limit: 20 požadavků za minutu per přihlášený uživatel (nebo IP jako fallback). Implementace v `src/lib/agent/rate-limiter.ts`. Při překročení vrátí `429` s českou zprávou a `Retry-After` hlavičkou.

## Přihlášení

Aplikace podporuje dva způsoby přihlášení:

1. **E-mail + heslo** — Supabase Auth (`signInWithPassword` / `signUp`)
2. **Google OAuth** — přihlášení přes firemní Google účet (stávající chování)

Po přihlášení přes Google OAuth je uživatel automaticky přesměrován na Gmail/Calendar OAuth (pokud ještě není napojený). E-mail + heslo tuto automatiku nespouští.

Přihlašovací stránka: `/login`
Registrační stránka: `/signup`

## Historie konverzací

Konverzace jsou ukládány do Supabase (tabulky `chat_threads` a `chat_messages`).

- Při načtení aplikace se ze serveru stáhne seznam posledních 50 vláken.
- Přepnutím na jiné vlákno se dotáhnou zprávy z DB (lazy loading).
- Nové vlákno se vytvoří přes `POST /api/chat/threads`.
- Agent API (`POST /api/chat`) nyní přijímá `threadId` a ukládá zprávy do DB.
- Zprávy jsou dostupné po obnovení stránky.

API endpointy:
- `GET /api/chat/threads` — seznam vláken
- `POST /api/chat/threads` — nové vlákno
- `GET /api/chat/threads/:id` — vlákno + zprávy
- `DELETE /api/chat/threads/:id` — smazání vlákna

## Nasazení

Produkční URL:

```text
https://zizka-amber.vercel.app
```

Aktuální function-calling verze byla nasazena na Vercel a ověřena přes `POST /api/agent`.

Povinné env proměnné pro plnou bezpečnost:
- `CRON_SECRET` — povinný pro cron endpointy (v produkci bez tohoto klíče cron nespustí)
- `HMAC_SECRET` nebo `CRON_SECRET` — HMAC klíč pro confirmation tokeny

Návod na ruční testování cron úloh: [docs/CRON_TESTING.md](./CRON_TESTING.md)
