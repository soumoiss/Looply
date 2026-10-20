-- Private, recipient-scoped VIP notes.
create table if not exists public.secret_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  content text not null check (char_length(trim(content)) between 1 and 5000),
  media_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  constraint secret_messages_read_timestamp check ((is_read = false and read_at is null) or (is_read = true and read_at is not null))
);
create index if not exists secret_messages_recipient_unread_idx on public.secret_messages (recipient_id, created_at desc) where is_read = false;
create index if not exists secret_messages_sender_created_idx on public.secret_messages (sender_id, created_at desc);

alter table public.secret_messages enable row level security;
revoke all on public.secret_messages from anon;
grant select, insert, update, delete on public.secret_messages to authenticated;

drop policy if exists secret_messages_select_recipient_or_admin on public.secret_messages;
create policy secret_messages_select_recipient_or_admin on public.secret_messages
for select to authenticated using (recipient_id = (select auth.uid()) or private.is_admin());

drop policy if exists secret_messages_insert_admin_only on public.secret_messages;
create policy secret_messages_insert_admin_only on public.secret_messages
for insert to authenticated with check (private.is_admin() and sender_id = (select auth.uid()));

drop policy if exists secret_messages_delete_admin_only on public.secret_messages;
create policy secret_messages_delete_admin_only on public.secret_messages
for delete to authenticated using (private.is_admin());

drop policy if exists secret_messages_recipient_mark_read on public.secret_messages;
create policy secret_messages_recipient_mark_read on public.secret_messages
for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()) and is_read = true and read_at is not null);

-- Column-level UPDATE grants prevent recipients from changing message contents,
-- sender, recipient, title, or media. Admin can still manage records via RLS.
revoke update on public.secret_messages from authenticated;
grant update (is_read, read_at) on public.secret_messages to authenticated;

-- Dedicated private media bucket. Object path starts with recipient UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('looply-secret-messages', 'looply-secret-messages', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists secret_vip_media_admin_upload on storage.objects;
create policy secret_vip_media_admin_upload on storage.objects
for insert to authenticated with check (bucket_id = 'looply-secret-messages' and private.is_admin());

drop policy if exists secret_vip_media_private_read on storage.objects;
create policy secret_vip_media_private_read on storage.objects
for select to authenticated using (
  bucket_id = 'looply-secret-messages'
  and (private.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text)
);

drop policy if exists secret_vip_media_admin_delete on storage.objects;
create policy secret_vip_media_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'looply-secret-messages' and private.is_admin());
