-- FAP AI: day-of operations. One bus, many trips; cartons; pick-ups from pledged tents;
-- volunteers per collection point; and two event times.
-- Safe to run more than once. Run in Supabase: SQL Editor > paste > Run.

-- 1. Events: carton size and the two day-of times.
alter table public.events add column if not exists packs_per_carton integer default 10
  check (packs_per_carton is null or packs_per_carton > 0);
alter table public.events add column if not exists food_from timestamptz;      -- "Food starts arriving at"; empty = start + duration
alter table public.events add column if not exists bus_ready_by timestamptz;   -- "Bus at collection point by"

-- 2. Collection points: how many volunteers are there.
alter table public.collection_points add column if not exists volunteers integer
  check (volunteers is null or volunteers >= 0);

-- 3. Trips: the bus's 1st, 2nd, 3rd... trip of the event, numbered by approval time.
alter table public.trips add column if not exists trip_no integer check (trip_no is null or trip_no > 0);

update public.trips t
set trip_no = n.rn
from (
  select id, row_number() over (partition by event_id, bus_id order by created_at, id) as rn
  from public.trips
  where bus_id is not null
) n
where t.id = n.id and t.trip_no is null;

create unique index if not exists trips_bus_trip_no_idx on public.trips (event_id, bus_id, trip_no)
  where bus_id is not null and trip_no is not null;

-- 4. Batches: where a batch came from ('pickup' = collected from a pledged tent).
alter table public.batches add column if not exists source text;

-- 5. Pledged tents: who promised food, when to collect it, and how the pick-up went.
create table if not exists public.pledges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tent_name text not null,
  contact_name text,
  contact_phone text,
  pledged_packs integer check (pledged_packs is null or pledged_packs >= 0),
  pickup_from timestamptz,                                   -- entered and shown in Lagos time
  collection_point_id uuid references public.collection_points(id) on delete set null,
  status text not null default 'pledged'
    check (status in ('pledged','on_the_way','picked_up','no_food')),
  picked_up_at timestamptz,
  picked_up_packs integer check (picked_up_packs is null or picked_up_packs >= 0),
  batch_id uuid references public.batches(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists pledges_event_id_idx on public.pledges (event_id);
create index if not exists pledges_collection_point_id_idx on public.pledges (collection_point_id);

alter table public.pledges enable row level security;
drop policy if exists "staff full access" on public.pledges;
create policy "staff full access" on public.pledges for all to authenticated using (true) with check (true);

-- Food intake listens for pick-up updates.
do $$
begin
  alter publication supabase_realtime add table public.pledges;
exception when duplicate_object then null;
end $$;
