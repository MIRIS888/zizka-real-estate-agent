Projektový kontext
==================

-   Toto je Back Office Operations Agent pro realitní společnost.
-   Cílem je uspět ve výběrovém řízení.
-   Priorita je funkční MVP.
-   Neoptimalizovat předčasně.
-   Nepřidávat zbytečnou komplexitu.

Pravidla
========

-   Nejdříve audit.
-   Potom návrh změn.
-   Potom implementace.
-   Po každé změně spustit lint, typecheck a build.
-   Nevymýšlet data.
-   Odpovědi musí vycházet z databáze nebo seed dat.

Povinné scénáře
===============

(vlož všech 6 scénářů ze zadání)

Cílová architektura
===================

(vlož architekturu, kterou jsem navrhl)

Definition of Done
==================

-   build prochází
-   lint prochází
-   typecheck prochází
-   funguje na Vercelu
-   funguje všech 6 scénářů


Implementace n8n a Gemini
=========================

Cíl
---

Projekt musí používat Gemini jako hlavní AI vrstvu a n8n jako workflow automation vrstvu pro plánované úkoly, monitoring a externí integrace.

Nepřesouvej celou aplikaci do n8n. n8n má být pouze doplňková workflow vrstva. Hlavní UI, API, databáze, grafy a odpovědi agenta musí zůstat v aplikaci nasazené na Vercelu.

Cílová architektura
-------------------

Uživatel komunikuje s aplikací přes Next.js frontend.

Next.js backend endpoint `/api/agent` přijme dotaz uživatele, zavolá Gemini, použije interní tools a podle potřeby zavolá databázi, grafy, reporty nebo n8n webhook.

n8n se používá pro:

-   ranní monitoring realitních serverů,
-   plánované reporty,
-   workflow automatizace,
-   e-mailové notifikace,
-   externí integrace.

Gemini se používá pro:

-   pochopení dotazu,
-   výběr správného toolu,
-   sepsání odpovědi,
-   generování návrhu e-mailu,
-   shrnutí reportu,
-   přípravu textů pro prezentaci.

Důležité pravidlo
-----------------

Gemini nesmí vymýšlet firemní data.

Čísla, tabulky a grafy musí vznikat z databáze nebo seed dat.

Správný princip:

Gemini píše text.
Databáze dodává čísla.
Kód generuje grafy.
n8n spouští workflow.

Soubory k vytvoření nebo opravení
---------------------------------

Vytvoř nebo uprav tyto soubory:

-   `src/lib/gemini.ts`
-   `src/lib/n8n.ts`
-   `src/lib/agent-tools.ts`
-   `src/app/api/agent/route.ts`
-   `src/app/api/cron/monitoring/route.ts`
-   `docs/N8N_SETUP.md`
-   `docs/GEMINI_SETUP.md`
-   `.env.example`

Environment variables
---------------------

Do `.env.example` přidej:

GEMINI_API_KEY=
DATABASE_URL=
N8N_BASE_URL=
N8N_MONITORING_WEBHOOK_URL=
N8N_REPORT_WEBHOOK_URL=
N8N_EMAIL_WEBHOOK_URL=
APP_BASE_URL=http://localhost:3000
CRON_SECRET=

Gemini implementace
-------------------

Implementuj Gemini klienta v `src/lib/gemini.ts`.

Gemini musí umět:

-   přijmout uživatelský dotaz,
-   vrátit strukturovaný JSON,
-   vybrat správný intent,
-   rozlišit datový dotaz, e-mail, report, monitoring a obecný dotaz.

Očekávané intenty:

-   `new_clients_q1`
-   `leads_vs_sold_6_months`
-   `email_draft_viewing`
-   `missing_property_data`
-   `weekly_report`
-   `real_estate_monitoring`
-   `general`

Gemini odpověď musí být validní JSON například:

{
"intent": "new_clients_q1",
"needsData": true,
"needsChart": true,
"needsN8n": false,
"responseStyle": "business"
}

Pokud Gemini vrátí nevalidní JSON, aplikace musí mít fallback intent detection podle klíčových slov.

Agent tools
-----------

V `src/lib/agent-tools.ts` implementuj:

-   `getNewClientsForQ1`
-   `getLeadAndSoldTrendLastSixMonths`
-   `findPropertiesWithMissingReconstructionData`
-   `generateEmailDraftForViewing`
-   `generateWeeklyManagementReport`
-   `createMonitoringTask`
-   `callN8nMonitoringWebhook`
-   `callN8nReportWebhook`
-   `callN8nEmailWebhook`

Každý tool musí vracet strukturovaný objekt:

{
"success": true,
"data": {},
"table": [],
"charts": [],
"message": ""
}

n8n implementace
----------------

V `src/lib/n8n.ts` vytvoř funkce:

-   `triggerMonitoringWorkflow(payload)`
-   `triggerReportWorkflow(payload)`
-   `triggerEmailWorkflow(payload)`

Tyto funkce budou volat n8n webhook URL z environment variables.

Pokud není n8n webhook nastavený, aplikace nesmí spadnout. Musí použít mock fallback a v odpovědi jasně uvést, že workflow běží v mock režimu.

Povinné n8n workflow
--------------------

Připrav dokumentaci pro tři workflow:

### 1. Real Estate Monitoring Workflow

Trigger:

-   Schedule Trigger každý den ráno

Kroky:

-   získat nové nabídky pro lokalitu,
-   filtrovat duplicity,
-   shrnout výsledky přes Gemini,
-   poslat výsledek e-mailem nebo uložit do aplikace.

Pro MVP je povolen mock zdroj dat.

### 2. Weekly Report Workflow

Trigger:

-   Webhook nebo Schedule Trigger

Kroky:

-   zavolat aplikaci pro data,
-   vytvořit shrnutí,
-   vrátit report nebo poslat e-mail.

### 3. Email Draft Workflow

Trigger:

-   Webhook

Kroky:

-   přijmout klienta, nemovitost a dostupné termíny,
-   vytvořit návrh e-mailu,
-   vrátit text zpět do aplikace.

API endpoint `/api/agent`
-------------------------

Endpoint musí:

1.  Přijmout zprávu uživatele.
2.  Zavolat Gemini intent detection.
3.  Podle intentu zavolat správný tool.
4.  Vrátit odpověď pro frontend ve strukturovaném formátu.

Response formát:

{
"answer": "textová odpověď",
"tables": [],
"charts": [],
"generatedFiles": [],
"workflow": {
"used": true,
"provider": "n8n",
"status": "mocked | triggered | failed"
}
}

UI
--

Frontend musí u odpovědi zobrazit:

-   text odpovědi,
-   tabulky,
-   grafy,
-   workflow status,
-   tlačítka pro demo dotazy.

U monitoringu musí UI ukázat například:

Monitoring vytvořen:
Lokalita: Praha Holešovice
Periodicita: každé ráno
Workflow: n8n
Stav: aktivní nebo mock režim

Fallback režim
--------------

Projekt musí fungovat i bez nastaveného n8n a Gemini API klíče.

Pokud chybí Gemini API klíč:

-   použij lokální intent detection podle klíčových slov.

Pokud chybí n8n webhook:

-   použij mock workflow response.

Nikdy nenech aplikaci spadnout jen kvůli chybějící externí integraci.

Dokumentace
-----------

Vytvoř:

### `docs/GEMINI_SETUP.md`

Musí obsahovat:

-   kde získat Gemini API key,
-   jak nastavit `GEMINI_API_KEY`,
-   jak Gemini v projektu funguje,
-   jaké intenty agent používá,
-   co dělat, když API klíč chybí.

### `docs/N8N_SETUP.md`

Musí obsahovat:

-   jak spustit n8n,
-   jak vytvořit webhook workflow,
-   jak nastavit environment variables,
-   popis tří workflow,
-   co je v MVP mockované,
-   jak by se workflow napojilo na produkční systémy.

Definition of Done
------------------

Implementace je hotová, pokud:

-   aplikace projde buildem,
-   funguje `/api/agent`,
-   Gemini se používá pro intent detection nebo je dostupný fallback,
-   n8n webhooky jsou připravené,
-   aplikace funguje i bez n8n díky mock fallbacku,
-   monitoring realit lze vytvořit z UI,
-   u monitoringu je jasně vidět workflow status,
-   README a dokumentace popisují n8n i Gemini,
-   všech 6 demo scénářů ze zadání funguje.
