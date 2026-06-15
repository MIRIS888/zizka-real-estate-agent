create table public.market_digest_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  market_watch_rule_id uuid not null references public.market_watch_rules(id) on delete cascade,
  n8n_workflow_id text not null,
  location_query text not null,
  listing_count integer not null default 0,
  executed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.market_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  market_watch_rule_id uuid references public.market_watch_rules(id) on delete set null,
  digest_run_id uuid references public.market_digest_runs(id) on delete set null,
  external_id text not null,
  title text not null,
  url text not null,
  price numeric(14, 2),
  source text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, external_id)
);

create index market_digest_runs_organization_executed_at_idx
  on public.market_digest_runs (organization_id, executed_at desc);

create index market_listings_organization_last_seen_at_idx
  on public.market_listings (organization_id, last_seen_at desc);

alter table public.market_digest_runs enable row level security;
alter table public.market_listings enable row level security;

create policy "Members can read market digest runs"
  on public.market_digest_runs for select
  using (public.is_organization_member(organization_id));

create policy "Members can read market listings"
  on public.market_listings for select
  using (public.is_organization_member(organization_id));
