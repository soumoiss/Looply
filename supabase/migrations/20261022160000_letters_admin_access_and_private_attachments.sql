-- Letters: admin collection access and private attachment storage.
-- Admin identity is determined only by private.is_admin(), backed by private.admin_users.
alter table public.community_letters
  add column if not exists attachments jsonb not null default '[]'::jsonb;

drop policy if exists archived_cards_recipient_read on public.archived_cards;
drop policy if exists archived_cards_recipient_or_admin_read on public.archived_cards;
create policy archived_cards_recipient_or_admin_read on public.archived_cards
  for select to authenticated
  using (recipient_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists archived_cards_admin_update on public.archived_cards;
create policy archived_cards_admin_update on public.archived_cards
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists archived_cards_admin_delete on public.archived_cards;
create policy archived_cards_admin_delete on public.archived_cards
  for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists community_letters_admin_update on public.community_letters;
create policy community_letters_admin_update on public.community_letters
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists community_letters_admin_delete on public.community_letters;
create policy community_letters_admin_delete on public.community_letters
  for delete to authenticated
  using ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('looply-letters', 'looply-letters', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4','application/pdf','text/plain','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists looply_letters_related_read on storage.objects;
create policy looply_letters_related_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'looply-letters'
    and exists (
      select 1 from public.community_letters l
      where l.id::text = (storage.foldername(name))[1]
        and (l.sender_id = (select auth.uid())
          or l.recipient_id = (select auth.uid())
          or (select private.is_admin()))
    )
  );

drop policy if exists looply_letters_sender_upload on storage.objects;
create policy looply_letters_sender_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'looply-letters'
    and exists (
      select 1 from public.community_letters l
      where l.id::text = (storage.foldername(name))[1]
        and (l.sender_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

drop policy if exists looply_letters_sender_admin_delete on storage.objects;
create policy looply_letters_sender_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'looply-letters'
    and exists (
      select 1 from public.community_letters l
      where l.id::text = (storage.foldername(name))[1]
        and (l.sender_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

drop policy if exists looply_letters_sender_admin_update on storage.objects;
create policy looply_letters_sender_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'looply-letters'
    and exists (
      select 1 from public.community_letters l
      where l.id::text = (storage.foldername(name))[1]
        and (l.sender_id = (select auth.uid()) or (select private.is_admin()))
    )
  )
  with check (
    bucket_id = 'looply-letters'
    and exists (
      select 1 from public.community_letters l
      where l.id::text = (storage.foldername(name))[1]
        and (l.sender_id = (select auth.uid()) or (select private.is_admin()))
    )
  );
