-- FAP AI: one link per bus per event (instead of one per trip).
-- The bus lead keeps one page open all night; their current trip appears on it.
-- Run in Supabase: SQL Editor > paste > Run.

create table public.bus_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),  -- secret for the /b/<token> link
  created_at timestamptz not null default now(),
  unique (event_id, bus_id)
);

alter table public.bus_links enable row level security;
create policy "staff full access" on public.bus_links for all to authenticated using (true) with check (true);

-- Trips that already have a bus get that bus's link for the event.
insert into public.bus_links (event_id, bus_id)
select distinct event_id, bus_id from public.trips where bus_id is not null
on conflict (event_id, bus_id) do nothing;

-- The per-trip token is gone. Old /b/<trip token> links stop working; share the bus link instead.
alter table public.trips drop column token;
