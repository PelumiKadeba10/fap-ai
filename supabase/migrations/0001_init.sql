-- FAP AI: initial schema
-- Run in Supabase: SQL Editor > paste > Run (or `supabase db push` with the CLI).

-- One row per event (Convocation, Matriculation, ...). Only one should be active at a time.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'convocation'
    check (type in ('convocation','matriculation','conference','wedding','religious')),
  students integer not null default 0 check (students >= 0),
  guests_per_student numeric not null default 0 check (guests_per_student >= 0),
  meals_served integer check (meals_served is null or meals_served >= 0),
  vendors integer not null default 5 check (vendors >= 1),
  starts_at timestamptz not null,
  duration_hours numeric not null default 6 check (duration_hours > 0),
  venue_name text not null default 'Convocation Centre',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Beneficiary sites. Shared across events.
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'Community'
    check (kind in ('School','Community','Care home','Shelter','Other')),
  people integer check (people is null or people >= 0),       -- need tonight; overrides the history forecast
  history integer[] not null default '{}',                     -- past distributions, oldest first
  capacity integer check (capacity is null or capacity >= 0),
  km numeric not null check (km > 0),                          -- road distance from the venue
  direction text not null default 'N'
    check (direction in ('N','NE','E','SE','S','SW','W','NW')),
  contact_name text,
  contact_phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  vehicle text not null default 'none' check (vehicle in ('none','car','bike')),
  created_at timestamptz not null default now()
);

-- Food recovered during an event.
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  food text not null,
  qty integer not null check (qty > 0),
  category text not null default 'cooked_meal'
    check (category in ('cooked_meal','bread_pastry','fruit_veg','packaged','drinks')),
  collected_at timestamptz not null default now(),
  location text not null default 'Convocation Centre',
  condition text,
  notes text,
  raw_message text,
  parsed_by text check (parsed_by in ('claude','local','manual')),
  created_at timestamptz not null default now()
);

-- One delivery = some portions of one batch going to one site.
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  volunteer_id uuid references public.volunteers(id) on delete set null,
  qty integer not null check (qty > 0),
  status text not null default 'assigned'
    check (status in ('assigned','picked_up','on_the_way','delayed','delivered')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),  -- secret for the volunteer link
  safe_until timestamptz not null,
  planned_km numeric,
  was_delayed boolean not null default false,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Every status change, for the timeline and the impact report.
create table public.status_updates (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index on public.batches (event_id);
create index on public.deliveries (event_id);
create index on public.deliveries (batch_id);
create index on public.status_updates (delivery_id);

-- Row level security: signed-in staff (coordinators) can do everything.
-- Volunteers never sign in; their page uses the secret token through a server action.
-- IMPORTANT: in Supabase Auth settings, turn OFF "Allow new users to sign up"
-- and invite coordinators manually, so only staff can sign in.
alter table public.events enable row level security;
alter table public.sites enable row level security;
alter table public.volunteers enable row level security;
alter table public.batches enable row level security;
alter table public.deliveries enable row level security;
alter table public.status_updates enable row level security;

create policy "staff full access" on public.events for all to authenticated using (true) with check (true);
create policy "staff full access" on public.sites for all to authenticated using (true) with check (true);
create policy "staff full access" on public.volunteers for all to authenticated using (true) with check (true);
create policy "staff full access" on public.batches for all to authenticated using (true) with check (true);
create policy "staff full access" on public.deliveries for all to authenticated using (true) with check (true);
create policy "staff full access" on public.status_updates for all to authenticated using (true) with check (true);

-- Live dispatch board listens to these.
alter publication supabase_realtime add table public.deliveries, public.status_updates;
