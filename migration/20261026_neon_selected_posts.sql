-- Selected-audience posts are created atomically under verified Neon Auth.
create or replace function public.v4_create_selected_post(p_body text,p_recipient_ids uuid[],p_external_url text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select public.looply_legacy_uid()); created uuid; nr int; ct int;
begin
  if actor is null then raise exception 'Neon authentication required' using errcode='42501';end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 5000 then
    raise exception 'Invalid publication body' using errcode='22023';end if;
  nr:=cardinality(p_recipient_ids);
  if nr is null or nr not between 1 and 20 then
    raise exception 'Choose 1-20 recipients' using errcode='22023';end if;
  select count(distinct id) into ct from public.profiles where id=any(p_recipient_ids);
  if ct<>nr then raise exception 'Unknown or repeated recipient' using errcode='22023';end if;
  insert into public.posts(author_id,body,visibility,external_url)
  values(actor,p_body,'selected',p_external_url) returning id into created;
  insert into public.post_recipients(post_id,recipient_id)
  select created,unnest(p_recipient_ids);
  return created;
end;
$$;

revoke all on function public.v4_create_selected_post(text,uuid[],text) from public,anonymous;

grant execute on function public.v4_create_selected_post(text,uuid[],text) to authenticated;
