-- Author-scoped publication RPCs: authenticated Neon identity is checked by the database,
-- rather than relying on a client PATCH or matching role privileges across old deployments.
CREATE OR REPLACE FUNCTION public.v5_create_post(p_body text,p_visibility text,p_external_url text default null)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=(SELECT public.looply_legacy_uid()); created uuid;
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_visibility NOT IN ('public','private') THEN RAISE EXCEPTION 'Invalid visibility' USING ERRCODE='22023'; END IF;
 INSERT INTO public.posts(author_id,body,visibility,external_url)
 VALUES(owner_id,p_body,p_visibility,p_external_url) RETURNING id INTO created;
 RETURN created;
END; $$;
REVOKE ALL ON FUNCTION public.v5_create_post(text,text,text) FROM public,anonymous;
GRANT EXECUTE ON FUNCTION public.v5_create_post(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v5_create_story(p_body text,p_visibility text,p_recipient_ids uuid[] default '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=(SELECT public.looply_legacy_uid()); created uuid; cnt integer;
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_visibility NOT IN ('public','private','selected') THEN RAISE EXCEPTION 'Invalid visibility' USING ERRCODE='22023'; END IF;
 IF p_visibility='selected' THEN
  cnt:=coalesce(cardinality(p_recipient_ids),0);
  IF cnt NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT id) FROM public.profiles WHERE id=ANY(p_recipient_ids))<>cnt
  THEN RAISE EXCEPTION 'Invalid story recipients' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.stories(author_id,body,visibility) VALUES(owner_id,p_body,p_visibility) RETURNING id INTO created;
 IF p_visibility='selected' THEN
   INSERT INTO public.story_recipients(story_id,recipient_id)
   SELECT created,unnest(p_recipient_ids);
 END IF;
 RETURN created;
END; $$;
REVOKE ALL ON FUNCTION public.v5_create_story(text,text,uuid[]) FROM public,anonymous;
GRANT EXECUTE ON FUNCTION public.v5_create_story(text,text,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.v5_attach_post_media(
 p_post_id uuid,p_storage_path text,p_kind text,p_mime_type text,p_byte_size bigint,p_alt_text text default ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=(SELECT public.looply_legacy_uid()); result uuid;
BEGIN
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.posts WHERE id=p_post_id AND author_id=owner_id)
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 INSERT INTO public.post_media(post_id,storage_path,kind,mime_type,byte_size,alt_text)
 VALUES(p_post_id,p_storage_path,p_kind,p_mime_type,p_byte_size,coalesce(p_alt_text,''))
 RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.v5_attach_post_media(uuid,text,text,text,bigint,text) FROM public,anonymous;
GRANT EXECUTE ON FUNCTION public.v5_attach_post_media(uuid,text,text,text,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v5_attach_story_media(
 p_story_id uuid,p_storage_path text,p_kind text,p_mime_type text,p_byte_size bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=(SELECT public.looply_legacy_uid()); result uuid;
BEGIN
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.stories WHERE id=p_story_id AND author_id=owner_id)
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 INSERT INTO public.story_media(story_id,storage_path,kind,mime_type,byte_size,alt_text)
 VALUES(p_story_id,p_storage_path,p_kind,p_mime_type,p_byte_size,'')
 RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.v5_attach_story_media(uuid,text,text,text,bigint) FROM public,anonymous;
GRANT EXECUTE ON FUNCTION public.v5_attach_story_media(uuid,text,text,text,bigint) TO authenticated;
