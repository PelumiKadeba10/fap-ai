-- FAP AI: optional photo with food reported through a collection link.
-- Run in Supabase: SQL Editor > paste > Run.

alter table public.batches add column photo_path text;  -- path inside the batch-photos bucket

-- Private bucket: nobody can open a photo by URL; coordinators get short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('batch-photos', 'batch-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Signed-in coordinators can read. There are no insert/update/delete policies:
-- uploads and deletes are done server-side with the service-role key.
create policy "staff read batch photos" on storage.objects
  for select to authenticated using (bucket_id = 'batch-photos');
