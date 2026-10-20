-- Extend the existing global announcements feature; avoid parallel duplicate tables.
alter table public.global_announcements add column if not exists media_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('looply-announcements', 'looply-announcements', true, 20971520, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update set public = true, file_size_limit = 20971520,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];

drop policy if exists looply_announcements_admin_upload on storage.objects;
create policy looply_announcements_admin_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'looply-announcements'
  and (select private.is_admin())
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists looply_announcements_admin_delete on storage.objects;
create policy looply_announcements_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'looply-announcements'
  and (select private.is_admin())
  and (storage.foldername(name))[1] = auth.uid()::text
);
