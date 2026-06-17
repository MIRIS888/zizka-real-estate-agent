create table public.scheduled_tasks (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  task_type    text        not null check (task_type in ('market_digest')),
  params       jsonb       not null default '{}'::jsonb,
  schedule_time text       not null,
  timezone     text        not null default 'Europe/Prague',
  frequency    text        not null default 'daily' check (frequency in ('daily')),
  is_active    boolean     not null default true,
  last_run_at  timestamptz,
  next_run_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index scheduled_tasks_user_id_idx
  on public.scheduled_tasks (user_id);

-- Partial index on due tasks — used by the cron runner
create index scheduled_tasks_due_idx
  on public.scheduled_tasks (next_run_at)
  where is_active = true;

alter table public.scheduled_tasks enable row level security;

-- Users see and manage only their own tasks; cron uses service role (bypasses RLS)
create policy "Users can view their own scheduled tasks"
  on public.scheduled_tasks for select
  using (auth.uid() = user_id);

create policy "Users can create their own scheduled tasks"
  on public.scheduled_tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own scheduled tasks"
  on public.scheduled_tasks for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own scheduled tasks"
  on public.scheduled_tasks for delete
  using (auth.uid() = user_id);
