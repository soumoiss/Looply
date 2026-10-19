-- Add bounded offset pagination to the protected admin audit reader.
create or replace function public.read_looply_admin_audit(
  p_actor_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if p_actor_id is null or not exists (
    select 1 from private.admin_users as administrator
    where administrator.user_id = p_actor_id
  ) then
    raise exception 'Administrator membership required' using errcode = '42501';
  end if;

  if coalesce(p_offset, 0) < 0 or coalesce(p_offset, 0) > 10000 then
    raise exception 'Invalid audit offset' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(entries) order by entries.created_at desc), '[]'::jsonb)
    into result
  from (
    select id, actor_id, event, resource_type, resource_id, purpose, request_id, metadata, created_at
    from private.admin_audit
    order by created_at desc, id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) as entries;

  return result;
end;
$function$;

revoke all on function public.read_looply_admin_audit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.read_looply_admin_audit(uuid, integer, integer) to service_role;
