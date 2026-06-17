create table public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

alter table public.google_accounts enable row level security;

create policy "Members can read google accounts"
  on public.google_accounts for select
  using (public.is_organization_member(organization_id));
