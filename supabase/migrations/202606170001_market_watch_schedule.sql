alter table public.market_watch_rules
  add column if not exists schedule_days integer[] not null default array[1,2,3,4,5,6,7],
  add column if not exists schedule_time text not null default '08:00',
  add column if not exists timezone text not null default 'Europe/Prague',
  add column if not exists recipient_email text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists market_watch_rules_active_schedule_idx
  on public.market_watch_rules (is_active, schedule_time);
