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
- `find_calendar_events` — vyhledá existující události v kalendáři
- `create_calendar_event` — vytvoří událost (vyžaduje potvrzení)
- `update_calendar_event` — upraví existující událost (vyžaduje potvrzení)
- `delete_calendar_event` — smaže existující událost (vyžaduje potvrzení)
- `create_email_draft`
- `send_email`
- `create_weekly_report`
- `send_morning_report`
- `watch_market`

Popisy funkcí jsou v `BUSINESS_FUNCTION_DECLARATIONS`. Tyto popisy říkají modelu, kdy má funkci použít a jaké parametry vyplnit.

## Bezpečnostní pravidla

Akce s následkem se nesmí provést bez potvrzení uživatele:

- `send_email`
- `send_morning_report`
- `create_calendar_event` — potvrzení: "ano vytvoř"
- `update_calendar_event` — potvrzení: "ano uprav" nebo "ano přesuň"
- `delete_calendar_event` — potvrzení: "ano smaž" nebo "ano zruš"
- `watch_market` s `mode: "schedule"`
- `create_scheduled_task`, `update_scheduled_task`, `delete_scheduled_task`

Toto je vynucené v promptu i v serverovém kódu v `run-agent.ts`. Pokud model zavolá consequential funkci bez potvrzení, server ji nespustí a vrátí potvrzovací zprávu.

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

## Nasazení

Produkční URL:

```text
https://zizka-amber.vercel.app
```

Aktuální function-calling verze byla nasazena na Vercel a ověřena přes `POST /api/agent`.

Návod na ruční testování cron úloh: [docs/CRON_TESTING.md](./CRON_TESTING.md)
