# Demo Script

## Predstaveni

Toto je Back Office Operations Agent pro realitni firmu. Agent pomaha odpovidat na dotazy nad obchodnimi daty, generovat grafy a reporty, pripravovat e-maily k prohlidkam a zakladat pravidelne monitoringy nabidek.

## Architektura

- UI bezi v Next.js a Reactu.
- Chat vola `POST /api/agent`.
- Demo data jsou deterministicka v lokalnim seed souboru, aby vysledky pri nataceni zustaly stejne.
- Gemini, Google Calendar, Gmail, Supabase a Firecrawl jsou pripravene jako produkcni rozsireni, ale pro hlavni demo nejsou nutne.

## Ukazka dotazu 1

Prompt:

```text
Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?
```

Ukazat:

- presny pocet klientu za Q1,
- tabulku klientu,
- rozdeleni podle zdroje,
- graf podle zdroje,
- Generated outputs s CSV.

## Ukazka dotazu 2

Prompt:

```text
Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.
```

Ukazat:

- mesicni tabulku,
- kombinovany graf,
- samostatny graf leadu,
- samostatny graf prodanych nemovitosti,
- trendove shrnuti.

## Ukazka dotazu 3

Prompt:

```text
Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.
```

Ukazat:

- doporuceny termin,
- navrh e-mailu,
- tlacitko Kopirovat,
- mockovanou dostupnost v kalendari.

## Ukazka dotazu 4

Prompt:

```text
Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.
```

Ukazat:

- seznam nemovitosti,
- chybejici pole,
- prioritu,
- doporuceny dalsi krok.

## Ukazka dotazu 5

Prompt:

```text
Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.
```

Ukazat:

- kratky Markdown report,
- KPI tabulku,
- strukturu tri slidu,
- Markdown export reportu.

## Ukazka dotazu 6

Prompt:

```text
Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.
```

Ukazat:

- vytvoreny monitoring task,
- lokalitu Praha Holesovice,
- periodicitu kazde rano,
- mockovane aktualni nabidky.

## Co je realne a co mockovane

- Realne: UI, API route, validace requestu/response, tabulky, grafy, exporty, deterministicke vypocty nad daty.
- Mockovane: lokalni firemni dataset, kalendarni dostupnost bez Google OAuth, ulozeni monitoring tasku bez produkcni databaze, realitni nabidky bez Firecrawl API.
- Pripravene: Supabase migrace, Google OAuth route, Firecrawl search modul, Vercel cron route a n8n webhook koncept.

## Produkcni rozsireni

1. Presunout seed data do Supabase a zapnout `DATA_SOURCE=supabase`.
2. Pridat row-level security a audit log tool volani.
3. Napojit Google Calendar FreeBusy a Gmail draft/send flow.
4. Zapnout Firecrawl Search a n8n/Vercel cron pro ranni monitoring.
5. Doplnit autentizaci roli a schvalovaci workflow pred odeslanim e-mailu.
