create or replace function public.get_my_conversation_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $function$
  select cp.conversation_id, count(cm.id)::bigint
  from public.conversation_participants as cp
  join public.chat_messages as cm
    on cm.conversation_id = cp.conversation_id
  where cp.user_id = (select auth.uid())
    and cm.sender_id <> (select auth.uid())
    and (cp.last_read_at is null or cm.created_at > cp.last_read_at)
  group by cp.conversation_id;
$function$;

revoke all on function public.get_my_conversation_unread_counts() from public, anon;
grant execute on function public.get_my_conversation_unread_counts() to authenticated;
