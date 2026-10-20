-- Android document providers can omit the MIME type for a valid content:// URI.
-- The browser normalizes only this allowlist from the extension; keep Storage and
-- database validation exactly aligned with that client-side contract.
alter table public.chat_media drop constraint if exists chat_media_mime_type_check;
alter table public.chat_media add constraint chat_media_mime_type_check check (mime_type in (
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm',
  'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'application/pdf',
  'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf'
));

alter table public.chat_media drop constraint if exists chat_media_path_matches_message;
alter table public.chat_media add constraint chat_media_path_matches_message check (
  storage_path ~ ('^conversations/' || conversation_id::text || '/' || message_id::text
    || '/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|webm|mp3|ogg|pdf|txt|csv|doc|docx|rtf)$')
);

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm',
  'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'application/pdf',
  'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf'
]::text[]
where id = 'looply-chat';

drop policy if exists looply_chat_insert_own_message on storage.objects;
create policy looply_chat_insert_own_message
on storage.objects for insert to authenticated
with check (
  bucket_id = 'looply-chat'
  and name ~ '^conversations/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|webm|mp3|ogg|pdf|txt|csv|doc|docx|rtf)$'
  and exists (
    select 1 from public.chat_messages as message
    where message.id = private.try_uuid(split_part(name, '/', 3))
      and message.conversation_id = private.try_uuid(split_part(name, '/', 2))
      and message.sender_id = (select auth.uid())
  )
);
