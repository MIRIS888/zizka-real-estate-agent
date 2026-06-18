# Agent Setup

Aktualizováno: 2026-06-17

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
- `watch_market` s `mode: "schedule"`

Toto je vynucené v promptu i v serverovém kódu v `run-agent.ts`. Pokud model zavolá consequential funkci bez potvrzení, server ji nespustí a vrátí potvrzovací zprávu.

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
