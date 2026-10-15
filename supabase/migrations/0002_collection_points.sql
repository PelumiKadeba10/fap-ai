-- FAP AI: collection points (food reported directly by the lead at each vendor).
-- Run in Supabase: SQL Editor > paste > Run.

create table public.collection_points (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,                       -- e.g. "Vendor 3 – Cafeteria"
  lead_name text,
  lead_phone text,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),  -- secret for the /c/<token> link
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index on public.collection_points (event_id);

-- Food reported through a collection link waits for a coordinator to check it.
-- Existing rows stay approved.
alter table public.batches
  add column review_status text not null default 'approved'
    check (review_status in ('pending','approved')),
  add column collection_point_id uuid references public.collection_points(id) on delete set null;

create index on public.batches (review_status);
create index on public.batches (collection_point_id);

alter table public.collection_points enable row level security;
create policy "staff full access" on public.collection_points for all to authenticated using (true) with check (true);

-- Food intake listens for new submissions.
alter publication supabase_realtime add table public.batches;
