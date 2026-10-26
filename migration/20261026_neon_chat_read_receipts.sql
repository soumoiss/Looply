-- Neon-native chat delivery/read receipts and recipient-scoped notification access.
-- Additive only: no messages, conversations or notifications are modified during installation.

create or replace function public.mark_conversations_delivered(p_conversation_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select public.looply_legacy_uid());
begin
  if actor_id is null or coalesce(cardinality(p_conversation_ids), 0) > 50 then
    raise exception 'Invalid conversation list' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_conversation_ids, array[]::uuid[])) as requested(conversation_id)
    where requested.conversation_id is null
      or not exists (
        select 1 from public.conversation_participants as participant
        where participant.conversation_id = requested.conversation_id
          and participant.user_id = actor_id
      )
  ) then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;

  update public.chat_messages as message
  set delivered_at = pg_catalog.now()
  where message.conversation_id = any(coalesce(p_conversation_ids, array[]::uuid[]))
    and message.sender_id <> actor_id
    and message.delivered_at is null
    and exists (
      select 1 from public.conversation_participants as participant
      where participant.conversation_id = message.conversation_id
        and participant.user_id = actor_id
    );
end;
$function$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select public.looply_legacy_uid());
  latest_incoming timestamptz;
begin
  if actor_id is null or p_conversation_id is null or not exists (
    select 1 from public.conversation_participants as participant
    where participant.conversation_id = p_conversation_id
      and participant.user_id = actor_id
  ) then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;

  update public.chat_messages as message
  set delivered_at = coalesce(message.delivered_at, pg_catalog.now()),
      read_at = coalesce(message.read_at, pg_catalog.now())
  where message.conversation_id = p_conversation_id
    and message.sender_id <> actor_id
    and (message.delivered_at is null or message.read_at is null);

  select max(message.created_at) into latest_incoming
  from public.chat_messages as message
  where message.conversation_id = p_conversation_id
    and message.sender_id <> actor_id;

  if latest_incoming is not null then
    update public.conversation_participants as participant
    set last_read_at = greatest(participant.last_read_at, latest_incoming)
    where participant.conversation_id = p_conversation_id
      and participant.user_id = actor_id;
  end if;

  update public.chat_notifications as notification
  set read_at = pg_catalog.now()
  where notification.conversation_id = p_conversation_id
    and notification.user_id = actor_id
    and notification.read_at is null;
end;
$function$;

revoke all on function public.mark_conversations_delivered(uuid[]) from public, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public, authenticated;
grant execute on function public.mark_conversations_delivered(uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- chat_notifications had RLS enabled but no policies on the active Neon branch.
-- Give each signed-in profile access only to its own notification rows.
drop policy if exists chat_notifications_recipient_read on public.chat_notifications;
create policy chat_notifications_recipient_read
on public.chat_notifications for select to authenticated
using (user_id = (select public.looply_legacy_uid()));

drop policy if exists chat_notifications_recipient_update on public.chat_notifications;
create policy chat_notifications_recipient_update
on public.chat_notifications for update to authenticated
using (user_id = (select public.looply_legacy_uid()))
with check (user_id = (select public.looply_legacy_uid()));

revoke all on table public.chat_notifications from public, authenticated;
grant select on table public.chat_notifications to authenticated;
grant update (read_at) on table public.chat_notifications to authenticated;

create index if not exists chat_notifications_user_unread_conversation_idx
on public.chat_notifications (user_id, conversation_id, created_at desc)
where read_at is null;
