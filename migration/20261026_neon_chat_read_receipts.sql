-- Neon-native chat delivery/read receipts and recipient-scoped notification access.
-- Additive only: installation preserves all existing message and notification rows.

create or replace function public.mark_conversations_delivered(p_conversation_ids uuid[])
returns boolean
language sql
security definer
set search_path = ''
as $function$
  with actor as materialized (
    select public.looply_legacy_uid() as user_id
  ),
  valid_actor as materialized (
    select actor.user_id
    from actor
    where actor.user_id is not null
      and coalesce(cardinality(p_conversation_ids), 0) <= 50
      and not exists (
        select 1
        from unnest(coalesce(p_conversation_ids, array[]::uuid[])) as requested(conversation_id)
        left join public.conversation_participants as participant
          on participant.conversation_id = requested.conversation_id
         and participant.user_id = actor.user_id
        where participant.user_id is null
      )
  ),
  updated_messages as (
    update public.chat_messages as message
    set delivered_at = pg_catalog.now()
    from valid_actor
    where message.conversation_id = any(coalesce(p_conversation_ids, array[]::uuid[]))
      and message.sender_id <> valid_actor.user_id
      and message.delivered_at is null
      and exists (
        select 1 from public.conversation_participants as participant
        where participant.conversation_id = message.conversation_id
          and participant.user_id = valid_actor.user_id
      )
    returning message.id
  )
  select exists (select 1 from valid_actor)
$function$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  with actor as materialized (
    select public.looply_legacy_uid() as user_id
  ),
  eligible as materialized (
    select participant.conversation_id, participant.user_id
    from public.conversation_participants as participant
    cross join actor
    where participant.conversation_id = p_conversation_id
      and participant.user_id = actor.user_id
      and actor.user_id is not null
  ),
  latest_incoming as materialized (
    select max(message.created_at) as created_at
    from public.chat_messages as message
    where message.conversation_id = p_conversation_id
      and message.sender_id <> (select user_id from actor)
      and exists (select 1 from eligible)
  ),
  updated_messages as (
    update public.chat_messages as message
    set delivered_at = coalesce(message.delivered_at, pg_catalog.now()),
        read_at = coalesce(message.read_at, pg_catalog.now())
    where message.conversation_id = p_conversation_id
      and message.sender_id <> (select user_id from actor)
      and exists (select 1 from eligible)
      and (message.delivered_at is null or message.read_at is null)
    returning message.id
  ),
  updated_participant as (
    update public.conversation_participants as participant
    set last_read_at = greatest(participant.last_read_at, latest_incoming.created_at)
    from latest_incoming
    where participant.conversation_id = p_conversation_id
      and participant.user_id = (select user_id from actor)
      and exists (select 1 from eligible)
      and latest_incoming.created_at is not null
    returning participant.user_id
  ),
  updated_notifications as (
    update public.chat_notifications as notification
    set read_at = pg_catalog.now()
    where notification.conversation_id = p_conversation_id
      and notification.user_id = (select user_id from actor)
      and notification.read_at is null
      and exists (select 1 from eligible)
    returning notification.id
  )
  select exists (select 1 from eligible)
$function$;

revoke all on function public.mark_conversations_delivered(uuid[]) from public, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public, authenticated;
grant execute on function public.mark_conversations_delivered(uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create policy chat_notifications_recipient_read
on public.chat_notifications for select to authenticated
using (user_id = (select public.looply_legacy_uid()));

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
