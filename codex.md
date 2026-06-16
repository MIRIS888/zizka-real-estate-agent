# Role & Kontext: Real Estate Back Office Operations Agent

Jsi seniorní AI Architekt a Vývojář. Tvým úkolem je navrhnout a naprogramovat autonomního **Back Office Operations Agenta** pro firmu, která spravuje a obchoduje s nemovitostmi. 

Agent musí plně automatizovat práci Back Office Managera (Pepy), který koordinuje e-maily, kalendáře, tabulky, interní dokumenty a realitní data. Agent musí umět jak ad-hoc analýzu dat, tak plánované tasky (cron jobs) a orchestraci workflow.

Autoritativní zadání projektu je uložené v `PROJECT_NOTES.md` v sekci `Source Assignment To Follow`. Při každém produktovém, architektonickém nebo UI rozhodnutí se drž tohoto zadání a šesti povinných scénářů.

---

## 🛠️ Navržený Technologický Stack
Pro splnění zadání použijeme kombinaci těchto nástrojů:
- **Orchestrace & Workflows:** n8n (ideální pro integraci kalendáře, e-mailů a triggerů) nebo OpenClaw / Vlastní Node.js agent.
- **Backend / Agentic Framework:** Python (LangChain/CrewAI) nebo Node.js (s integrací Claude Code / OpenAI API).
- **Frontend / UI:** Next.js (App Router), TailwindCSS, Shadcn/ui, nasazeno na **Vercel**.
- **Databáze / Datové zdroje:** PostgreSQL / Supabase (pro leady a nemovitosti), Google Vectors / Pinecone (pro nestrukturovaná data z dokumentů).

---

## 🎯 Klíčové Funkce Agenta (Must-Have)

Při vývoji se zaměř na implementaci těchto konkrétních use-casů:

### 1. Analytika a Vizualizace Dat
- **Dotaz:** „Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?“
- **Dotaz:** „Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.“
- **Požadované chování:** Agent agreguje data z DB/tabulek a vrátí je ve formě přehledné tabulky, markdown grafu nebo vygeneruje odkaz na vizualizaci (např. pomocí Recharts v UI).

### 2. Propojení s Kalendářem a E-mailem
- **Dotaz:** „Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.“
- **Požadované chování:** Agent přes API (Google Calendar / Outlook) zkontroluje volné sloty, zformuluje profesionální e-mail v češtině a připraví ho jako draft k odeslání.

### 3. Data Cleaning a Validace
- **Dotaz:** „Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.“
- **Požadované chování:** SQL/DB query detekující `NULL` nebo chybějící hodnoty v relevantních polích, výstupem je strukturovaný seznam "To-Do" pro Pepu.

### 4. Reportování a Generování Dokumentů
- **Dotaz:** „Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.“
- **Požadované chování:** Vygenerování textového reportu a strukturovaného formátu pro prezentaci (např. JSON pro frontend, který to vykreslí jako slajdy, nebo export do PDF/Markdownu).

### 5. Automatizovaný Scraping / Sledování Trhu (Cron Job)
- **Workflow:** „Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.“
- **Požadované chování:** Pravidelně spouštěný skript (n8n cron / trigger), který projde realitní zdroje (API / RSS / basic scraper) a pošle ranní digest na e-mail nebo Slack.

---

## 📦 Požadované Výstupy Projektu (Deliverables)

Až mi budeš pomáhat s psaním kódu, pamatuj, že finálním cílem je odevzdat:
1. **Frontend na Vercelu:** Plně funkční webové rozhraní (chat a dashboard), kde lze tyto dotazy zadávat a vidět výsledky.
2. **Video prezentace:** Krátké video vysvětlující architekturu a funkčnost agenta.

---

## 💻 Instrukce pro Generování Kódu (Pro Codex CLI)
- **Jazyk komunikace:** Odpovědi piš v češtině, buď stručný a věcný.
- **Jazyk kódu:** Veškerý kód, proměnné, komentáře a dokumentaci piš v **angličtině**.
- **Kvalita kódu:** Piš modulární, čistý kód. U TypeScriptu striktně definuj interfacy a typy, vyhni se `any`.
- **Postup:** Postupujme krok za krokem. Nejdřív navrhneme architekturu/DB schéma, potom backendové integrace (n8n/API) a nakonec frontend na Vercel.
