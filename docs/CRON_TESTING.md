# Testování cron úloh

Cron endpointy se lokálně nespouštějí automaticky — Vercel Cron funguje jen v produkci. Lokálně je lze volat ručně přes `curl`.

---

## Aktivní cron endpointy (vercel.json)

| Endpoint | Schedule | Co dělá |
|---|---|---|
| `/api/cron/run-due-tasks` | každý den v 06:00 UTC | zpracuje všechny due `scheduled_tasks` (market_digest + morning_report) |

### Deaktivované legacy endpointy (vrací 410)

| Endpoint | Důvod |
|---|---|
| `/api/cron/dispatcher` | Legacy `market_watch_rules` systém — decommissioned |
| `/api/cron/morning-report` | Ranní report je nyní `scheduled_task` typu `morning_report` |

---

## Jak funguje task runner

Jeden endpoint `/api/cron/run-due-tasks` zpracovává všechny typy úloh:

1. Načte všechny `scheduled_tasks` kde `is_active = true` a `next_run_at <= now()`
2. Pro každý task:
   - Vygeneruje `idempotency_key = task_id:next_run_at`
   - Vloží záznam do `scheduled_task_runs` (status=running)
   - Pokud insert selže na unique constraint → přeskočí (duplikát)
   - Načte Google účet pro `task.user_id` + obnoví token pokud je expirovaný
   - Spustí task (`market_digest` nebo `morning_report`)
   - Aktualizuje run na `success`/`failed`
   - Posune `next_run_at` na příští plánovaný čas
3. Výsledek vrátí jako JSON

### Typy tasků

| task_type | Co dělá | schedule_days |
|---|---|---|
| `market_digest` | Firecrawl search → Gmail | null (každý den) |
| `morning_report` | Ranní report → Gmail | [1,2,3,4,5] (Po–Pá) |

---

## Autorizace

Endpoint je chráněný:

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
curl -i http://localhost:3000/api/cron/run-due-tasks
```

Očekávání: `401 Unauthorized`

### 2. Task runner s autorizací

```bash
curl -i \
  -H "Authorization: Bearer nejaky_tajny_klic" \
  http://localhost:3000/api/cron/run-due-tasks
```

Očekávání:
- `{ "ok": true, "processed": N, "skipped": N, "failed": N, "results": [...] }`
- Pokud žádné due úlohy: `processed: 0`

### 3. Ověření legacy endpointů (musí vrátit 410)

```bash
curl -i \
  -H "Authorization: Bearer nejaky_tajny_klic" \
  http://localhost:3000/api/cron/dispatcher

curl -i \
  -H "Authorization: Bearer nejaky_tajny_klic" \
  http://localhost:3000/api/cron/morning-report
```

Očekávání: `410 Gone`

---

## Diagnostika

```bash
npm run diagnose:cron
```

Výstup ukáže:
- Aktivní Vercel cron routes
- Stav legacy endpointů
- Všechny `scheduled_tasks` s user_id, typem, plánem, příjemcem
- Google accounts (maskovaný email, stav tokenu)
- Posledních 20 `scheduled_task_runs`
- Potenciální duplicity

---

## Kontrola v Supabase

### Naplánované úlohy

```sql
select
  id,
  user_id,
  task_type,
  params,
  schedule_time,
  schedule_days,
  is_active,
  last_run_at,
  next_run_at
from scheduled_tasks
order by created_at desc;
```

### Audit log běhů

```sql
select
  r.id,
  r.task_id,
  r.status,
  r.started_at,
  r.finished_at,
  r.email_to,
  r.email_from,
  r.error_message,
  r.idempotency_key
from scheduled_task_runs r
order by r.started_at desc
limit 20;
```

### Google účty (bez tokenů!)

```sql
select id, user_id, email, token_expires_at, updated_at
from google_accounts
order by updated_at desc;
```

### Legacy ranní report log

```sql
select report_date, executed_at, summary, delivery_recipient
from daily_report_runs
order by executed_at desc
limit 10;
```

---

## Produkční test na Vercelu

```bash
curl -i \
  -H "Authorization: Bearer TVUJ_PROD_CRON_SECRET" \
  https://zizka-amber.vercel.app/api/cron/run-due-tasks
```

`CRON_SECRET` v produkci nastav v Vercel Dashboard → Settings → Environment Variables.

---

## Jak vypnout automatizaci

1. V UI: sekce **Naplánované úlohy** → klik na Pause/Delete
2. Přes agent v chatu: *"Vypni ranní report"* nebo *"Smaž monitoring Praha Holešovice"*
3. Přímo v DB:
   ```sql
   update scheduled_tasks set is_active = false where id = '...';
   ```

---

## Jak přidat novou automatizaci

Přes chat s agentem:
- *"Posílej mi každý den v 8 nabídky z Praha Vinohrady"* → vytvoří `market_digest` task
- Ranní report (`morning_report`) je seedovaný automaticky při setup a viditelný v UI

---

## Checklist

- [ ] `CRON_SECRET` je nastavený v `.env.local`
- [ ] `CRON_SECRET` je nastavený ve Vercel Environment Variables
- [ ] Endpoint bez `Authorization` vrací 401
- [ ] `/api/cron/dispatcher` vrací 410
- [ ] `/api/cron/morning-report` vrací 410
- [ ] `/api/cron/run-due-tasks` vrací JSON s výsledky
- [ ] `scheduled_tasks` mají `user_id` (ověřit přes `diagnose:cron`)
- [ ] `google_accounts` má `user_id` (ověřit přes `diagnose:cron`)
- [ ] Po spuštění vznikne záznam v `scheduled_task_runs`
- [ ] `last_run_at` a `next_run_at` se aktualizují po úspěšném běhu
- [ ] Vercel Logs ukazují spuštění cron endpointu
