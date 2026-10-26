-- FAP AI: messages between the admin panel and the field (bus leads and food intake links).
-- One thread per bus link (channel 'bus') or per collection point (channel 'intake').
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  channel text not null check (channel in ('bus', 'intake')),
  thread_id uuid not null,                               -- bus_links.id or collection_points.id
  sender text not null check (sender in ('admin', 'field')),
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,                                   -- when the other side opened it
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_idx on public.messages (channel, thread_id, created_at);
create index if not exists messages_event_unread_idx on public.messages (event_id) where read_at is null;
alter table public.messages enable row level security;
drop policy if exists "staff full access" on public.messages;
create policy "staff full access" on public.messages for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.messages;
