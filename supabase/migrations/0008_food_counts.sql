-- FAP AI: day-of food counts.
-- One latest edible count per collection point; loaded count per trip.

create table public.edible_counts (
  event_id uuid not null references public.events(id) on delete cascade,
  collection_point_id uuid not null references public.collection_points(id) on delete cascade,
  edible_packs integer not null check (edible_packs >= 0),
  recorded_at timestamptz not null default now(),
  primary key (event_id, collection_point_id)
);

create index edible_counts_event_id_idx on public.edible_counts (event_id);

alter table public.edible_counts enable row level security;
create policy "staff full access" on public.edible_counts for all to authenticated using (true) with check (true);

alter table public.trips add column loaded_packs integer check (loaded_packs is null or loaded_packs >= 0);

do $$
begin
  alter publication supabase_realtime add table public.edible_counts;
exception when duplicate_object then null;
end $$;
