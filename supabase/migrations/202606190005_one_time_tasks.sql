alter table public.scheduled_tasks
  add column if not exists schedule_kind text not null default 'recurring'
    check (schedule_kind in ('one_time', 'recurring')),
  add column if not exists run_once boolean not null default false,
  add column if not exists completed_at timestamptz null;
