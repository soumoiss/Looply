create or replace function private.cleanup_gallery_media_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source text := tg_argv[0];
begin
  delete from public.gallery_private_items where source=v_source and media_id=old.id;
  delete from public.gallery_album_items where source=v_source and media_id=old.id;
  delete from public.gallery_media_people where source=v_source and media_id=old.id;
  delete from public.gallery_media_descriptions where source=v_source and media_id=old.id;
  return old;
end;
$function$;

drop trigger if exists cleanup_archive_gallery_references on public.archive_media;
create trigger cleanup_archive_gallery_references
after delete on public.archive_media
for each row execute function private.cleanup_gallery_media_references('archive');

drop trigger if exists cleanup_community_gallery_references on public.community_gallery_media;
create trigger cleanup_community_gallery_references
after delete on public.community_gallery_media
for each row execute function private.cleanup_gallery_media_references('community');