-- Neon-authenticated conversation creation with original profile identities.
create or replace function public.v4_create_conversation(
 p_kind text, p_target_ids uuid[], p_subject text default null, p_body text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=(select public.looply_legacy_uid());
 recipients uuid[]; total integer; existing uuid; created uuid; target uuid; key text;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_kind not in ('direct','group','letter') then raise exception 'Unsupported conversation type' using errcode='22023';end if;
 if p_kind='letter' then
   select id into target from public.profiles where username='peixinho' limit 1;
   if target is null or target=actor then raise exception 'Administrator unavailable' using errcode='55000';end if;
   recipients:=array[target];
 else recipients:=p_target_ids;
 end if;
 total:=coalesce(cardinality(recipients),0);
 if total<1 or (p_kind='direct' and total<>1) or (p_kind='group' and (total<2 or total>49))
     or actor=any(recipients) then raise exception 'Invalid conversation recipients' using errcode='22023';end if;
 if (select count(distinct p.id) from public.profiles p where p.id=any(recipients))<>total
 then raise exception 'Unknown or duplicate recipients' using errcode='22023';end if;
 if p_kind in ('group','letter') and (p_subject is null or char_length(btrim(p_subject)) not between 1 and 120)
 then raise exception 'Invalid conversation subject' using errcode='22023';end if;
 if p_kind='letter' and (p_body is null or char_length(btrim(p_body)) not between 1 and 5000)
 then raise exception 'Invalid letter content' using errcode='22023';end if;
 if p_kind='direct' then
   key:=least(actor::text,recipients[1]::text)||':'||greatest(actor::text,recipients[1]::text);
   select c.id into existing from public.conversations c where c.kind='direct' and c.direct_key=key limit 1;
   if existing is not null then
     if exists(select 1 from public.conversation_participants p where p.conversation_id=existing and p.user_id=actor)
     then return existing;end if;
     raise exception 'Conversation membership unavailable' using errcode='42501';
   end if;
 end if;
 insert into public.conversations(kind,created_by,subject,direct_key)
 values(p_kind,actor,case when p_kind='direct' then null else btrim(p_subject) end,key) returning id into created;
 insert into public.conversation_participants(conversation_id,user_id)
 select created,participant from unnest(array[actor]||recipients) as participant;
 if p_kind='letter' then
   insert into public.chat_messages(conversation_id,sender_id,body) values(created,actor,btrim(p_body));
 end if;
 return created;
end;
$$;
revoke all on function public.v4_create_conversation(text,uuid[],text,text) from public,anonymous;
grant execute on function public.v4_create_conversation(text,uuid[],text,text) to authenticated;
