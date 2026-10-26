alter table public.batches
  add column if not exists edible_packs integer;

do $$
begin
  alter table public.batches
    add constraint batches_edible_packs_check
    check (edible_packs is null or (edible_packs >= 0 and edible_packs <= qty));
exception when duplicate_object then null;
end $$;
