-- Looply V24: finalize externally shared links/files only AFTER authorized upload.
-- Private staging posts remain author-only even if the browser loses connection.
-- All recipient rows and the visibility switch commit in one transaction.
CREATE OR REPLACE FUNCTION public.v24_publish_shared_post(
  p_post_id uuid, p_visibility text, p_recipient_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT public.looply_legacy_uid());
  v_post public.posts%ROWTYPE;
  v_count integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_visibility NOT IN ('public','selected') THEN
    RAISE EXCEPTION 'Invalid audience' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_post FROM public.posts
   WHERE id = p_post_id AND author_id = v_actor AND visibility = 'private'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not the author of an unpublished share' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(v_post.body),'') = '' AND v_post.external_url IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.post_media WHERE post_id = p_post_id) THEN
    RAISE EXCEPTION 'Empty share' USING ERRCODE = '22023';
  END IF;

  IF p_visibility = 'selected' THEN
    v_count := cardinality(p_recipient_ids);
    IF v_count IS NULL OR v_count NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Select between 1 and 20 recipients' USING ERRCODE = '22023';
    END IF;
    IF EXISTS(SELECT 1 FROM unnest(p_recipient_ids) u(id) WHERE u.id IS NULL OR u.id = v_actor)
       OR v_count <> (SELECT count(DISTINCT id) FROM unnest(p_recipient_ids) u(id))
       OR v_count <> (SELECT count(*) FROM public.profiles WHERE id = ANY(p_recipient_ids)) THEN
      RAISE EXCEPTION 'Invalid or duplicated recipient' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.post_recipients(post_id,recipient_id)
      SELECT p_post_id, id FROM unnest(p_recipient_ids) u(id);
  ELSIF coalesce(cardinality(p_recipient_ids),0) <> 0 THEN
    RAISE EXCEPTION 'Public share cannot contain private recipients' USING ERRCODE='22023';
  END IF;

  -- Last operation: the post becomes visible only after all validation and
  -- recipients are present. No clients may set the visibility mid-upload.
  UPDATE public.posts SET visibility=p_visibility,updated_at=clock_timestamp()
  WHERE id=p_post_id AND author_id=v_actor;
  RETURN p_post_id;
END
$function$;

REVOKE ALL ON FUNCTION public.v24_publish_shared_post(uuid,text,uuid[]) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v24_publish_shared_post(uuid,text,uuid[]) TO authenticated;
