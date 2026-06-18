# Testování cron úloh

Cron endpointy se lokálně nespouštějí automaticky podle rozvrhu — Vercel Cron funguje jen v produkci. Lokálně je lze zavolat ručně přes `curl`.

---

## Cron endpointy v projektu

| Endpoint | Spouští se | Co dělá |
|---|---|---|
| `/api/cron/dispatcher` | každý den v 06:00 UTC | čte aktivní `market_watch_rules` a spouští Firecrawl hledání |
| `/api/cron/morning-report` | Po–Pá v 06:00 UTC | sestaví ranní report a odešle ho přes Gmail |

---

## Autorizace

Endpointy jsou chráněné přes hlavičku:

```
Authorization: Bearer CRON_SECRET
```

Nastav v `.env.local`:

```env
CRON_SECRET=nejaky_tajny_klic
```

---

## Lokální testy

### 1. Test bez autorizace

```bash
curl -i http://localhost:3000/api/cron/dispatcher
```

Očekávání: `401 Unauthorized`

---

### 2. Dispatcher s autorizací

```bash
curl -i \
  -H "Authorization: Bearer nejaky_tajny_klic" \
  http://localhost:3000/api/cron/dispatcher
```

Očekávání:

- endpoint vrátí JSON
- pokud nejsou žádné due úlohy: `{ "message": "no rules due now" }` nebo obdobné
- pokud úlohy existují: zpracují se a vrátí se shrnutí

---

### 3. Morning report s autorizací

```bash
curl -i \
  -H "Authorization: Bearer nejaky_tajny_klic" \
  http://localhost:3000/api/cron/morning-report
```

Očekávání:

- endpoint vrátí JSON
- pokud není připojený Gmail účet: vrátí řízenou chybu, nespadne
- pokud je Gmail připojený: report se odešle na nastavený e-mail

---

## Kontrola v Supabase

### Market watch / dispatcher

```sql
select
  id,
  name,
  location_query,
  is_active,
  schedule_days,
  schedule_time,
  timezone,
  recipient_email,
  last_run_at,
  updated_at
from market_watch_rules
order by updated_at desc
limit 20;
```

Po úspěšném zpracování se má aktualizovat `last_run_at`. Pokud se dispatcher spustil, ale `last_run_at` se nezměnilo, úloha buď nebyla due, nebo selhala.

---

### Morning reporty

```sql
select
  id,
  report_date,
  timezone,
  executed_at,
  delivery_channel,
  delivery_recipient,
  delivered_at,
  summary
from daily_report_runs
order by executed_at desc
limit 20;
```

Po úspěšném ranním reportu má vzniknout nový záznam. Sloupec `delivered_at` je vyplněný, pokud byl e-mail skutečně odeslán.

---

## Produkční test na Vercelu

```bash
curl -i \
  -H "Authorization: Bearer TVUJ_PROD_CRON_SECRET" \
  https://zizka-amber.vercel.app/api/cron/dispatcher
```

```bash
curl -i \
  -H "Authorization: Bearer TVUJ_PROD_CRON_SECRET" \
  https://zizka-amber.vercel.app/api/cron/morning-report
```

`CRON_SECRET` v produkci nastav v Vercel Dashboard → Settings → Environment Variables.

---

## Checklist

- [ ] `CRON_SECRET` je nastavený v `.env.local`
- [ ] Endpoint bez `Authorization` vrací 401
- [ ] Endpoint se správným Bearer tokenem vrací JSON
- [ ] Dispatcher nespadne, když nejsou žádné due úlohy
- [ ] Dispatcher aktualizuje `last_run_at`, pokud zpracuje úlohu
- [ ] Morning report vrací řízenou chybu, pokud není připojený Gmail
- [ ] Vercel Production má nastavený `CRON_SECRET`
- [ ] Vercel Logs ukazují spuštění cron endpointu

---

## Jak poznám, že cron opravdu funguje

Cron funguje, pokud:

- bez autorizace endpoint vrací 401
- se správným `CRON_SECRET` endpoint vrací JSON
- při due úloze se aktualizuje `last_run_at` v `market_watch_rules`
- report se zapíše do `daily_report_runs`
- v produkci je běh vidět ve Vercel Logs (Functions tab)
