create table public.daily_report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  n8n_workflow_id text not null,
  report_date date not null,
  timezone text not null default 'Europe/Prague',
  executed_at timestamptz not null,
  summary text not null,
  metrics jsonb not null default '{}'::jsonb,
  highlights jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  delivery_channel text not null default 'dashboard'
    check (delivery_channel in ('email', 'slack', 'dashboard', 'none')),
  delivery_recipient text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, report_date, n8n_workflow_id)
);

create index daily_report_runs_organization_report_date_idx
  on public.daily_report_runs (organization_id, report_date desc);

alter table public.daily_report_runs enable row level security;

create policy "Members can read daily report runs"
  on public.daily_report_runs for select
  using (public.is_organization_member(organization_id));
