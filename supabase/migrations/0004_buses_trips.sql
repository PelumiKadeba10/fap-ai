-- FAP AI: hubs and buses.
-- Hubs are the existing collection_points. A bus loads at ONE hub, visits several sites (stops), then returns.
-- Run in Supabase: SQL Editor > paste > Run.

-- Buses are shared across events (like sites and volunteers).
create table public.buses (
  id uuid primary key default gen_random_uuid(),
  name text not null,                                   -- "Bus 1"
  capacity integer not null default 400 check (capacity > 0),
  lead_name text,
  lead_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One trip = one bus loading at one hub and visiting a list of stops.
-- hub_id is nullable only for food logged without a hub (manual intake before hubs existed).
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  hub_id uuid references public.collection_points(id) on delete set null,
  bus_id uuid references public.buses(id) on delete set null,   -- empty until a bus is assigned
  status text not null default 'planned'
    check (status in ('planned','loading','departed','returned','cancelled')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),  -- secret for the /b/<token> link
  created_at timestamptz not null default now(),
  departed_at timestamptz,
  returned_at timestamptz
);

create index on public.trips (event_id);
create index on public.trips (bus_id);

-- A delivery is now one stop's food from one batch. Several deliveries can share a stop.
alter table public.deliveries
  add column trip_id uuid references public.trips(id) on delete cascade,
  add column stop_order integer;

create index on public.deliveries (trip_id);

alter table public.buses enable row level security;
alter table public.trips enable row level security;
create policy "staff full access" on public.buses for all to authenticated using (true) with check (true);
create policy "staff full access" on public.trips for all to authenticated using (true) with check (true);

-- The bus board listens to trips (deliveries are already published).
alter publication supabase_realtime add table public.trips;
