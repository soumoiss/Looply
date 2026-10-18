-- Private WebRTC signaling for direct Looply conversations.
-- Only authenticated members of the conversation may join and exchange call broadcasts.
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
    from public.conversation_participants cp
    where cp.conversation_id::text = substring((select realtime.topic()) from 13)
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
    from public.conversation_participants cp
    where cp.conversation_id::text = substring((select realtime.topic()) from 13)
      and cp.user_id = (select auth.uid())
  )
);
