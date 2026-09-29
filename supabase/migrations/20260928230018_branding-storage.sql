-- Public bucket for physio logos (docs/specs/09-physio-branding.md). Logos appear in link
-- previews and PDFs and hold no patient data, so reads are public; writes are limited to the
-- owner's folder: object names start with "{physio_id}/".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "branding_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "branding_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "branding_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "branding_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);
