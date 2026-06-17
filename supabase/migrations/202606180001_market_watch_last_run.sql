alter table public.market_watch_rules
  add column if not exists last_run_at timestamptz;
