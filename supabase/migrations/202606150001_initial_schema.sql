create extension if not exists "pgcrypto";

create type public.lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'viewing_scheduled',
  'won',
  'lost'
);

create type public.property_status as enum (
  'draft',
  'active',
  'reserved',
  'sold',
  'archived'
);

create type public.agent_run_status as enum (
  'pending',
  'running',
  'waiting_for_confirmation',
  'completed',
  'failed'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  status public.lead_status not null default 'new',
  source text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  address text not null,
  city text not null,
  district text,
  status public.property_status not null default 'draft',
  price numeric(14, 2),
  floor_area numeric(10, 2),
  reconstruction_year integer,
  building_modifications text,
  energy_rating text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  request_text text not null,
  intent text,
  status public.agent_run_status not null default 'pending',
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_name text not null,
  input jsonb not null,
  output jsonb,
  requires_confirmation boolean not null default false,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.market_watch_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location_query text not null,
  filters jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  n8n_workflow_id text,
  created_at timestamptz not null default now()
);

create index leads_organization_created_at_idx
  on public.leads (organization_id, created_at desc);
create index properties_organization_status_idx
  on public.properties (organization_id, status);
create index tasks_organization_due_at_idx
  on public.tasks (organization_id, due_at);
create index agent_runs_organization_created_at_idx
  on public.agent_runs (organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.properties enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_runs enable row level security;
alter table public.tool_calls enable row level security;
alter table public.market_watch_rules enable row level security;

create function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
  );
$$;

create policy "Members can read their organizations"
  on public.organizations for select
  using (public.is_organization_member(id));

create policy "Members can read organization memberships"
  on public.organization_members for select
  using (public.is_organization_member(organization_id));

create policy "Members can read clients"
  on public.clients for select
  using (public.is_organization_member(organization_id));

create policy "Members can read leads"
  on public.leads for select
  using (public.is_organization_member(organization_id));

create policy "Members can read properties"
  on public.properties for select
  using (public.is_organization_member(organization_id));

create policy "Members can read tasks"
  on public.tasks for select
  using (public.is_organization_member(organization_id));

create policy "Members can read agent runs"
  on public.agent_runs for select
  using (public.is_organization_member(organization_id));

create policy "Members can read tool calls"
  on public.tool_calls for select
  using (
    exists (
      select 1
      from public.agent_runs
      where agent_runs.id = tool_calls.agent_run_id
        and public.is_organization_member(agent_runs.organization_id)
    )
  );

create policy "Members can read market watch rules"
  on public.market_watch_rules for select
  using (public.is_organization_member(organization_id));
