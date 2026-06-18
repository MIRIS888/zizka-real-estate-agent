-- Create chat_threads table
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nová konverzace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create chat_messages table
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Create indexes for chat_threads
create index idx_chat_threads_user_id on public.chat_threads(user_id);
create index idx_chat_threads_updated_at on public.chat_threads(updated_at desc);

-- Create indexes for chat_messages
create index idx_chat_messages_thread_id on public.chat_messages(thread_id);
create index idx_chat_messages_created_at on public.chat_messages(created_at asc);

-- Enable Row Level Security on chat_threads
alter table public.chat_threads enable row level security;

-- Enable Row Level Security on chat_messages
alter table public.chat_messages enable row level security;

-- chat_threads policies
create policy "Users can read their own threads" on public.chat_threads
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own threads" on public.chat_threads
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own threads" on public.chat_threads
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their own threads" on public.chat_threads
  for delete
  using (auth.uid() = user_id);

-- chat_messages policies
create policy "Users can read messages from their own threads" on public.chat_messages
  for select
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

create policy "Users can insert messages into their own threads" on public.chat_messages
  for insert
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

create policy "Users can delete messages from their own threads" on public.chat_messages
  for delete
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));
