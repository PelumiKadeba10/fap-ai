alter table public.collection_points add column if not exists intake_token text;

update public.collection_points
set intake_token = replace(gen_random_uuid()::text, '-', '')
where intake_token is null;

alter table public.collection_points alter column intake_token set default replace(gen_random_uuid()::text, '-', '');
alter table public.collection_points alter column intake_token set not null;
create unique index if not exists collection_points_intake_token_idx on public.collection_points (intake_token);
