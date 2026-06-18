-- Chat history: threads and messages per user
create table if not exists public.chat_threads (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default 'Nová konverzace',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz null
);

create table if not exists public.chat_messages (
  id         uuid        primary key default gen_random_uuid(),
  thread_id  uuid        not null references public.chat_threads(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  role       text        not null check (role in ('user', 'assistant', 'system', 'tool')),
  content    text        not null,
  metadata   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_threads_user_id_idx    on public.chat_threads(user_id);
create index if not exists chat_threads_updated_at_idx on public.chat_threads(updated_at desc);
create index if not exists chat_messages_thread_id_idx on public.chat_messages(thread_id);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);

-- RLS
alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;

create policy "threads_select" on public.chat_threads for select using (auth.uid() = user_id);
create policy "threads_insert" on public.chat_threads for insert with check (auth.uid() = user_id);
create policy "threads_update" on public.chat_threads for update using (auth.uid() = user_id);
create policy "threads_delete" on public.chat_threads for delete using (auth.uid() = user_id);

create policy "messages_select" on public.chat_messages for select using (auth.uid() = user_id);
create policy "messages_insert" on public.chat_messages for insert with check (auth.uid() = user_id);
