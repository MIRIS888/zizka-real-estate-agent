# Back Office Operations Agent

Demo/MVP interního agenta pro realitní back office. Aplikace umí odpovídat nad firemními daty, vracet tabulky a grafy, připravit e-mail k prohlídce, najít chybějící data u nemovitostí, vytvořit týdenní report a založit ranní monitoring realitních serverů.

## Stack

- Frontend: Next.js 16, React 19, TypeScript.
- Backend: App Router API route `POST /api/agent`.
- Data: lokální deterministická seed data v `src/lib/local-data/seed.ts`; Supabase je připravený jako produkční cesta.
- Grafy: Recharts.
- AI: všechny dotazy jdou přes nativní Gemini function calling; deterministický demo agent v repozitáři zůstává jen jako nepoužívaný referenční soubor.

## Lokální spuštění

```bash
npm install
cp .env.example .env.local
npm run seed:local
npm run dev
```

Otevři `http://localhost:3000`.

Pro stabilní demo stačí:

```bash
DATA_SOURCE=local
```

`GEMINI_API_KEY` je povinný pro zpracování dotazů. Google, Supabase a Firecrawl jsou volitelné podle zapnutých integrací.

## Env proměnné

- `DATA_SOURCE=local` používá seed data v repozitáři.
- `DATA_SOURCE=supabase` používá Supabase tabulky, pokud jsou nastavené `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` a `DEFAULT_ORGANIZATION_ID`.
- `GEMINI_API_KEY` je povinný pro Gemini function calling agenta.
- `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET` zapínají Google OAuth pro kalendář/Gmail.
- `FIRECRAWL_API_KEY` zapíná live hledání realitních nabídek.
- `CRON_SECRET` chrání cron endpointy.

## Demo scénáře

V UI jsou připravená tlačítka pro těchto šest promptů:

1. `Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?`
2. `Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.`
3. `Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.`
4. `Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.`
5. `Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.`
6. `Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.`

Výstupy obsahují kombinaci Markdown odpovědi, tabulek, grafů, návrhu e-mailu a sekce `Generated outputs` pro stažení CSV/Markdown/textu.

## Validace

```bash
npm run lint
npm run typecheck
npm run build
```

Pro endpoint validaci nejdřív spusť server a potom:

```bash
npm run validate:demo
```

Pokud server běží jinde:

```bash
DEMO_BASE_URL=http://127.0.0.1:3003 npm run validate:demo
```

## Vercel deploy

1. Nastav projekt jako Next.js aplikaci.
2. Build command: `npm run build`.
3. Install command: `npm install`.
4. Přidej env proměnné podle `.env.example`.
5. Pro demo bez externích služeb stačí `DATA_SOURCE=local`.
6. Pro produkční data nastav Supabase env proměnné a spusť migrace v `supabase/migrations`.

## Jak funguje agent

`POST /api/agent` přijme zprávu a zavolá `runAgent`. Agent používá nativní Gemini function calling: Gemini může odpovědět rovnou textem nebo zavolat jednu či více deklarovaných funkcí. Server provede tool, vrátí výsledek jako `functionResponse` a Gemini pokračuje až do finální odpovědi. Pokud `GEMINI_API_KEY` není nastavený, agent vrátí jasnou českou chybu místo tichého fallbacku.

## Mockované části

- Lokální CRM/property dataset.
- Dostupnost v kalendáři, pokud není připojen Google Calendar.
- Uložení monitoring tasku v demo režimu.
- Realitní nabídky pro Holešovice, pokud není nastaven Firecrawl.

Agent v odpovědích uvádí zdroj dat, aby bylo zřejmé, zda jde o lokální demo, live integraci nebo plánovanou integraci.

## Produkční rozšíření

- Přesun dat do Supabase a zapnutí `DATA_SOURCE=supabase`.
- Row-level security, role a audit log všech tool volání.
- Google Calendar FreeBusy a Gmail draft/send s potvrzením uživatele.
- Firecrawl Search plus n8n nebo Vercel cron pro ranní monitoring.
- Skutečný export PPTX/PDF místo Markdown struktury slidů.
- Testy nad API routou a nad agregacemi dat.

## Dokumentace pro předání

- Audit: `docs/AUDIT.md`
- Nastavení agenta: `docs/AGENT_SETUP.md`
- Script pro video: `docs/DEMO_SCRIPT.md`
- Poznámky pro navázání v Claude Code: `CLAUDE.md`, `STATUS.md`, `codex.md`
