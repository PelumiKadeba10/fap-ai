-- FAP AI: setup is per event. Places stay a shared list; each event picks its own places (with its own
-- "people to feed" number), and buses belong to one event like collection points already do.
-- Safe to run more than once. Run in Supabase: SQL Editor > paste > Run.

-- 1. Which places an event delivers to, and how many people each needs fed at that event.
create table if not exists public.event_sites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  people integer not null default 0 check (people >= 0),
  created_at timestamptz not null default now(),
  unique (event_id, site_id)
);

create index if not exists event_sites_event_id_idx on public.event_sites (event_id);

alter table public.event_sites enable row level security;
drop policy if exists "staff full access" on public.event_sites;
create policy "staff full access" on public.event_sites for all to authenticated using (true) with check (true);

-- Existing events keep working: every active place is added to every event. The need is sites.people when set,
-- otherwise the same history forecast the app used before (last value + average change, rounded to 5, capped at capacity).
insert into public.event_sites (event_id, site_id, people)
select e.id, s.id,
  case
    when s.people is not null then s.people
    when coalesce(array_length(s.history, 1), 0) = 0 then 0
    when array_length(s.history, 1) = 1 then s.history[1]
    else least(
      (round(((s.history[array_length(s.history, 1)]
        + (s.history[array_length(s.history, 1)] - s.history[1])::numeric / (array_length(s.history, 1) - 1)) / 5)) * 5),
      coalesce(s.capacity, 2147483647)
    )::integer
  end
from public.events e
cross join public.sites s
where s.active
on conflict (event_id, site_id) do nothing;

-- 2. Buses belong to one event. Existing buses go to the latest event.
alter table public.buses add column if not exists event_id uuid references public.events(id) on delete cascade;
update public.buses
  set event_id = (select id from public.events order by starts_at desc limit 1)
  where event_id is null;
-- Only possible when there are no events at all: such buses have nothing to belong to.
delete from public.buses where event_id is null;
alter table public.buses alter column event_id set not null;
create index if not exists buses_event_id_idx on public.buses (event_id);

-- 3. Collection points already belong to an event; they also get a location note.
alter table public.collection_points add column if not exists location_note text;

-- sites.people stays as the default for new events. Matching reads event_sites.people instead.
