-- Tighten WebRTC signaling to direct conversations only.
-- Membership remains mandatory for both receiving and sending private broadcasts.
drop policy if exists "Looply direct call participants can receive signaling" on realtime.messages;
drop policy if exists "Looply direct call participants can send signaling" on realtime.messages;

create policy "Looply direct call participants can receive signaling"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) like 'looply-call-%'
  and exists (
    select 1
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
    where c.id::text = substring((select realtime.topic()) from 13)
      and c.kind = 'direct'
      and cp.user_id = (select auth.uid())
  )
);

create policy "Looply direct call participants can send signaling"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and (select realtime.topic()) like 'looply-call-%'
  and exists (
    select 1
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
    where c.id::text = substring((select realtime.topic()) from 13)
      and c.kind = 'direct'
      and cp.user_id = (select auth.uid())
  )
);
