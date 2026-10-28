-- Authenticated story engagement on the production Neon Data API.
-- Profile identity is always resolved server-side from the Neon JWT.
-- All writes remain subject to the story's expiry and visibility rules.
CREATE OR REPLACE FUNCTION public.record_story_view(p_story_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  actor uuid := public.looply_legacy_uid();
  author uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT s.author_id INTO author FROM public.stories s
    WHERE s.id=p_story_id AND s.expires_at>pg_catalog.now();
  IF author IS NULL OR actor=author OR NOT public.v3_can_view_story(p_story_id) THEN
    RETURN false;
  END IF;
  INSERT INTO public.story_views(story_id,viewer_id)
    VALUES(p_story_id,actor)
    ON CONFLICT (story_id,viewer_id) DO NOTHING;
  RETURN FOUND;
END
$fn$;
REVOKE ALL ON FUNCTION public.record_story_view(uuid) FROM public,anonymous;
GRANT EXECUTE ON FUNCTION public.record_story_view(uuid) TO authenticated;

-- A single transaction creates or retrieves a direct conversation, inserts
-- the actual chat message and retains a relational reference to the story.
CREATE OR REPLACE FUNCTION public.send_story_reply(p_story_id uuid,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  actor uuid := public.looply_legacy_uid();
  author uuid;
  conversation uuid;
  message uuid;
  content text := pg_catalog.btrim(p_body);
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF content IS NULL OR pg_catalog.char_length(content) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Invalid story reply length' USING ERRCODE='22023';
  END IF;
  SELECT s.author_id INTO author FROM public.stories s
    WHERE s.id=p_story_id AND s.expires_at>pg_catalog.now() FOR KEY SHARE;
  IF author IS NULL OR actor=author OR NOT public.v3_can_view_story(p_story_id) THEN
    RAISE EXCEPTION 'Story not available to this member' USING ERRCODE='42501';
  END IF;
  conversation := public.v4_create_conversation('direct',ARRAY[author]::uuid[],NULL,NULL);
  INSERT INTO public.chat_messages(conversation_id,sender_id,body)
    VALUES(conversation,actor,content) RETURNING id INTO message;
  INSERT INTO public.story_replies(story_id,conversation_id,message_id,sender_id)
    VALUES(p_story_id,conversation,message,actor);
  RETURN pg_catalog.jsonb_build_object('conversation_id',conversation,
    'message_id',message,'story_id',p_story_id);
END
$fn$;
REVOKE ALL ON FUNCTION public.send_story_reply(uuid,text) FROM public,anonymous;
GRANT EXECUTE ON FUNCTION public.send_story_reply(uuid,text) TO authenticated;

-- Only participants in the saved conversation may resolve reply-to-story
-- references. Table RLS is already enabled in the current Neon schema.
CREATE POLICY looply_v10_story_reply_conversation_read
ON public.story_replies FOR SELECT TO authenticated
USING (public.v3_is_conversation_participant(conversation_id));
