create table if not exists public.food_donations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  collection_point_id uuid not null references public.collection_points(id) on delete cascade,
  packs integer not null check (packs > 0),
  dropper_name text,
  donated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists food_donations_event_id_idx on public.food_donations (event_id, created_at desc);
create index if not exists food_donations_collection_point_id_idx on public.food_donations (collection_point_id, created_at desc);
alter table public.food_donations enable row level security;
drop policy if exists "staff full access" on public.food_donations;
create policy "staff full access" on public.food_donations for all to authenticated using (true) with check (true);
drop trigger if exists audit_row_change on public.food_donations;
create trigger audit_row_change after insert or delete on public.food_donations for each row execute function public.write_audit_log();
alter publication supabase_realtime add table public.food_donations;
