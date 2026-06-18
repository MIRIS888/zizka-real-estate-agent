# Demo data — Žižka Reality

Aktualizováno: 2026-06-18

---

## Shrnutí

Projekt má dvě datové cesty. Výchozí (`DATA_SOURCE=local`) používá hardcoded TypeScript data ze souboru `src/lib/local-data/seed.ts`. Doporučená varianta pro prezentaci (`DATA_SOURCE=supabase`) čte data ze Supabase databáze, ve které je plnohodnotný demo dataset naplněný skriptem `npm run seed:supabase`.

---

## Kde jsou demo data

| Typ dat | Soubor / zdroj |
|---|---|
| TypeScript seed (local) | `src/lib/local-data/seed.ts` |
| Supabase SQL seed | `supabase/seed.sql` |
| Seed script | `scripts/seed-supabase-demo.mjs` |

### Rozsah demo datasetu

| Entita | Počet |
|---|---|
| Organizace | 1 (Žižka Reality) |
| Klienti | 15 |
| Leady | 28 (Jan–Jun 2026) |
| Nemovitosti | 12 (4 aktivní, 2 rezervované, 6 prodaných) |
| Úkoly | 7 |
| Prohlídky (local) | 6 |
| Obchody/prodeje (local) | 6 |
| Ukázkové nabídky (local) | 8 (Holešovice, Karlín, Vinohrady, Dejvice) |

### Distribuce leadů po měsících

| Měsíc | Počet leadů | Prodeje |
|---|---|---|
| Leden 2026 | 3 | 1 (Libeň) |
| Únor 2026 | 5 | 1 (Dejvice) |
| Březen 2026 | 4 | 1 (Vršovice) |
| Duben 2026 | 5 | 1 (Žižkov) |
| Květen 2026 | 5 | 1 (Skalice) |
| Červen 2026 | 6 | 1 (Roztoky) |

### Nemovitosti s chybějícími daty (pro `find_incomplete_properties`)

| Nemovitost | Chybí |
|---|---|
| Byt 2+kk, Holešovice | Rok rekonstrukce, stavební úpravy |
| Byt 3+1, Bubeneč | Rok rekonstrukce, podlahová plocha |
| Byt 2+kk, Karlín | Podlahová plocha, energetická náročnost |
| Byt 4+1, Žižkov | Rok rekonstrukce |

---

## Jak se data načítají

```
DATA_SOURCE=local  →  src/lib/local-data/seed.ts (in-memory TypeScript)
DATA_SOURCE=supabase  →  Supabase tabulky (leads, properties, clients, tasks)
```

`query_lead_metrics` a `find_incomplete_properties` mají obě cesty (local i Supabase).

`query_sales_metrics` čte leady po měsících + prodané nemovitosti po měsících (dle `updated_at`).

`create_weekly_report` dynamicky počítá počty z aktuálních dat — nejde o hardcoded text.

---

## Jaký režim použít na sobotní prezentaci

### Varianta A — Supabase demo (doporučeno)

Prezentace působí reálněji. Data jsou v databázi, agent říká "Supabase databáze".

```env
DATA_SOURCE=supabase
GEMINI_API_KEY=tvuj_gemini_klic
NEXT_PUBLIC_SUPABASE_URL=https://dcyfzajomhbbquzpxgub.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEFAULT_ORGANIZATION_ID=00000000-0000-4000-8000-000000000001
CRON_SECRET=nejaky_tajny_klic
```

Spusť seed před prezentací: viz níže.

### Varianta B — Lokální demo (bezpečný fallback)

Funguje bez Supabase. Vhodné pokud máš problémy s připojením nebo chceš jistotu.

```env
DATA_SOURCE=local
GEMINI_API_KEY=tvuj_gemini_klic
```

Nevyžaduje Supabase, ale Auth login nebude fungovat. Pokud používáš Supabase Auth, přidej:

```env
NEXT_PUBLIC_SUPABASE_URL=https://dcyfzajomhbbquzpxgub.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Jak spustit seed (Supabase)

```bash
# Ujisti se, že máš v .env.local nastavené Supabase proměnné
npm run seed:supabase
```

Seed je idempotentní — lze ho spustit opakovaně bez duplikací. Skript vloží:
- organizaci Žižka Reality
- 15 klientů
- 12 nemovitostí
- 28 leadů
- 7 úkolů

Po úspěšném seedu nastav `DATA_SOURCE=supabase` a restartuj server.

---

## Jak ověřit, že data fungují

Po seedu a spuštění serveru zkus v chatu:

```
Kolik leadů máme za posledních 6 měsíců?
```

Očekávání: agent vrátí graf s daty. Pod grafem uvidíš `Supabase databáze` (nebo `Lokální demo dataset`).

---

## Přehled nástrojů — zdroj dat

| Tool | DATA_SOURCE=local | DATA_SOURCE=supabase |
|---|---|---|
| `query_lead_metrics` | seed.ts → localLeads | Supabase tabulka `leads` |
| `query_sales_metrics` | seed.ts → localLeads + localDeals | Supabase `leads` + `properties` (status=sold) |
| `find_incomplete_properties` | seed.ts → localProperties | Supabase tabulka `properties` |
| `create_weekly_report` | seed.ts (dynamic) | Supabase (dynamic) |
| `find_calendar_slots` | Demo termíny (mock_fallback) | Demo termíny nebo Google Calendar (live) |
| `create_calendar_event` | N/A — vyžaduje Google Calendar | Google Calendar API |
| `create_email_draft` | Gemini + demo termíny | Gemini + Google Calendar (pokud připojen) |
| `send_email` | N/A — vyžaduje Google | Gmail API |
| `send_morning_report` | N/A — vyžaduje Google | Gmail API + data dle DATA_SOURCE |
| `watch_market` (preview) | Demo nabídky (localMarketListings) | Firecrawl nebo demo nabídky |
| `watch_market` (schedule) | Supabase market_watch_rules | Supabase market_watch_rules |
| `create_scheduled_task` | Supabase scheduled_tasks | Supabase scheduled_tasks |
| `list_scheduled_tasks` | Supabase scheduled_tasks | Supabase scheduled_tasks |

---

## Co dělat, když integrace nejsou připojené

| Integrace | Co se stane bez ní |
|---|---|
| Google Calendar | `find_calendar_slots` vrátí demo termíny označené jako demo. `create_calendar_event` a `send_email` vrátí řízenou chybu. |
| Gmail | `send_email` a `send_morning_report` vrátí řízenou chybu "Gmail není připojen". |
| Firecrawl | `watch_market` vrátí demo nabídky z `localMarketListings` označené jako "Demo záloha". |

Agent vždy uvede, zda jde o live integraci nebo demo zálohu.

---

## Testovací otázky do chatu

1. `Jaké nové klienty máme za posledních 6 měsíců? Ukaž to graficky.`
   → Očekávání: graf leadů po měsících (Jan–Jun, celkem 28 leadů)

2. `Odkud nám chodí nejvíc leadů?`
   → Očekávání: rozpad podle zdroje (Sreality nejsilnější)

3. `Kolik nemovitostí máme aktivně v nabídce?`
   → Očekávání: 4 aktivní (Holešovice 2+kk, Bubeneč 3+1, Karlín 2+kk, Žižkov 4+1)

4. `Najdi nemovitosti, kterým chybí údaje o rekonstrukci nebo stavebních úpravách.`
   → Očekávání: 4 nemovitosti (Holešovice, Bubeneč, Karlín, Žižkov)

5. `Vytvoř report výsledků za poslední týden pro vedení.`
   → Očekávání: 3 slidy s reálnými čísly z DB, ne hardcoded text

6. `Ukaž vývoj leadů a prodaných nemovitostí za posledních 6 měsíců.`
   → Očekávání: multi-series graf (leady + prodeje)

7. `Najdi nové byty v Holešovicích.`
   → Očekávání: demo nabídky (3 záznamy) pokud Firecrawl nepřipojen

8. `Jaké mám dnes volné termíny?`
   → Očekávání: 3 demo termíny za 2–4 dny označené jako demo

9. `Každé ráno mi posílej monitoring nabídek v Holešovicích.`
   → Očekávání: agent požádá o potvrzení (nevytvoří ihned)

10. `Shrň mi stav kanceláře jako řediteli.`
    → Očekávání: manažerské shrnutí z interních dat

---

## Rizika na prezentaci

| Riziko | Prevence |
|---|---|
| Supabase DB nedostupná | Mít připravený `.env.local` s `DATA_SOURCE=local` jako zálohu |
| GEMINI_API_KEY expirovaný | Ověřit API key den předem na `ai.google.dev` |
| Google Calendar scope chybí | Bez Google Calendar agent vrátí demo termíny — to je OK pro demo |
| Firecrawl limit | Bez Firecrawl vrátí demo nabídky — jasně označené |
| Seed duplikuje data | Seed je idempotentní (`ON CONFLICT DO NOTHING`) — bezpečné opakovat |
| `DEFAULT_ORGANIZATION_ID` nesedí | Musí být `00000000-0000-4000-8000-000000000001` pro demo seed |
| Auth login selže | Bez přihlášení scheduled_tasks nefungují — ostatní tooly ano (service role) |
