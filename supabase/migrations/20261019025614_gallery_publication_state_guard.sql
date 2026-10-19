create or replace function private.guard_gallery_publication_state()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.publication_state='published' and new.publication_state<>'published' then
    raise exception 'Published gallery media cannot return to pending state' using errcode='42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_gallery_publication_state on public.community_gallery_media;
create trigger guard_gallery_publication_state
before update of publication_state on public.community_gallery_media
for each row execute function private.guard_gallery_publication_state();