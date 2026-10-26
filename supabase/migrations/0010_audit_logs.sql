create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid references public.events(id) on delete set null,
  action text not null check (action in ('created', 'deleted')),
  entity_type text not null,
  entity_id text not null,
  actor_user_id uuid,
  actor_label text not null default 'system/public',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_event_created_idx on public.audit_logs (event_id, created_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "staff can read audit logs" on public.audit_logs;
create policy "staff can read audit logs" on public.audit_logs for select to authenticated using (true);

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb;
  event_uuid uuid;
  entity_uuid text;
  actor uuid;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  entity_uuid := coalesce(row_data->>'id', '');
  if row_data ? 'event_id' then event_uuid := nullif(row_data->>'event_id', '')::uuid;
  elsif TG_TABLE_NAME = 'events' then event_uuid := nullif(row_data->>'id', '')::uuid;
  elsif TG_TABLE_NAME = 'status_updates' then
    select d.event_id into event_uuid from public.deliveries d where d.id = (row_data->>'delivery_id')::uuid;
  end if;
  actor := auth.uid();
  insert into public.audit_logs (event_id, action, entity_type, entity_id, actor_user_id, actor_label, details)
  values (
    event_uuid,
    case when TG_OP = 'DELETE' then 'deleted' else 'created' end,
    TG_TABLE_NAME,
    entity_uuid,
    actor,
    case when actor is null then 'public/system' else 'coordinator' end,
    row_data - 'token' - 'lead_phone' - 'contact_phone' - 'photo_path'
  );
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['events', 'event_sites', 'collection_points', 'batches', 'deliveries', 'trips', 'buses', 'bus_links', 'pledges', 'edible_counts', 'status_updates'] loop
    execute format('drop trigger if exists audit_row_change on public.%I', table_name);
    execute format('create trigger audit_row_change after insert or delete on public.%I for each row execute function public.write_audit_log()', table_name);
  end loop;
end $$;

alter publication supabase_realtime add table public.audit_logs;
