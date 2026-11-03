-- Looply 2026-11-03. Additive comment engagement and authenticated previews.
-- Preserves all existing posts, comments, notifications, media and direct messages.
-- Existing notifications are not replayed or rewritten.
CREATE TABLE IF NOT EXISTS public.comment_likes(
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_likes_pkey PRIMARY KEY(comment_id,user_id)
);

CREATE INDEX IF NOT EXISTS comment_likes_user_created_idx
  ON public.comment_likes(user_id,created_at DESC);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_likes FROM PUBLIC,anonymous;
GRANT SELECT,INSERT,DELETE ON public.comment_likes TO authenticated;

DO $policy$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='comment_likes' AND policyname='comment_likes_read') THEN
    CREATE POLICY comment_likes_read ON public.comment_likes FOR SELECT TO authenticated
      USING(EXISTS(SELECT 1 FROM public.comments c WHERE c.id=comment_id));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='comment_likes' AND policyname='comment_likes_insert') THEN
    CREATE POLICY comment_likes_insert ON public.comment_likes FOR INSERT TO authenticated
      WITH CHECK(
        user_id=(SELECT public.looply_legacy_uid()) AND
        EXISTS(SELECT 1 FROM public.comments c WHERE c.id=comment_id)
      );
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='comment_likes' AND policyname='comment_likes_delete') THEN
    CREATE POLICY comment_likes_delete ON public.comment_likes FOR DELETE TO authenticated
      USING(user_id=(SELECT public.looply_legacy_uid()));
  END IF;
END;
$policy$;

-- Each genuine new post comment/reply queues one inbox notification to the
-- post owner and, when different, the parent comment owner. The actual
-- comment text comes from Neon, never from the browser's notification request.
CREATE OR REPLACE FUNCTION public.v35_notify_post_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
  v_owner uuid;
  v_parent_owner uuid;
  v_visibility text;
  v_target uuid;
  v_preview text;
BEGIN
  SELECT p.author_id,p.visibility INTO v_owner,v_visibility
  FROM public.posts p WHERE p.id=NEW.post_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT c.author_id INTO v_parent_owner
    FROM public.comments c
    WHERE c.id=NEW.parent_comment_id AND c.post_id=NEW.post_id;
  END IF;
  v_preview:=LEFT(regexp_replace(btrim(NEW.body),'[[:cntrl:]]+',' ','g'),180);
  IF v_preview='' THEN v_preview:='Comentou com um anexo'; END IF;
  FOR v_target IN SELECT DISTINCT recipient
    FROM unnest(ARRAY[v_owner,v_parent_owner]) AS t(recipient)
    WHERE recipient IS NOT NULL AND recipient<>NEW.author_id
  LOOP
    IF v_visibility='public' OR v_target=v_owner OR EXISTS(
      SELECT 1 FROM public.post_recipients pr
      WHERE pr.post_id=NEW.post_id AND pr.recipient_id=v_target
    ) THEN
      INSERT INTO public.notifications
        (recipient_id,actor_id,kind,resource_id,event_id,preview)
      VALUES (v_target,NEW.author_id,
        CASE WHEN NEW.parent_comment_id IS NULL THEN 'comment' ELSE 'reply' END,
        NEW.post_id,NEW.id,v_preview)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.v35_notify_post_comment() FROM PUBLIC,anonymous,authenticated;

DO $trigger$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='looply_v35_post_comment_notify') THEN
    CREATE TRIGGER looply_v35_post_comment_notify AFTER INSERT ON public.comments
      FOR EACH ROW EXECUTE FUNCTION public.v35_notify_post_comment();
  END IF;
END;
$trigger$;

-- A like on an individual comment notifies that comment's owner. Reuse the
-- existing allowed 'post_like' inbox category but distinguish the comment
-- in the preview (avoids relaxing existing notification constraints).
CREATE OR REPLACE FUNCTION public.v35_notify_comment_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE v_recipient uuid;v_post uuid;
BEGIN
  SELECT c.author_id,c.post_id INTO v_recipient,v_post
  FROM public.comments c WHERE c.id=NEW.comment_id;
  IF v_recipient IS NOT NULL AND v_recipient<>NEW.user_id THEN
    INSERT INTO public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
    VALUES(v_recipient,NEW.user_id,'post_like',v_post,
      md5('cl:'||NEW.comment_id::text||':'||NEW.user_id::text)::uuid,
      'Curtiu seu comentário')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.v35_notify_comment_like() FROM PUBLIC,anonymous,authenticated;
DO $trigger$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='looply_v35_comment_like_notify') THEN
    CREATE TRIGGER looply_v35_comment_like_notify AFTER INSERT ON public.comment_likes
      FOR EACH ROW EXECUTE FUNCTION public.v35_notify_comment_like();
  END IF;
END;
$trigger$;

-- All NEW chat messages get a 180-character excerpt in the *recipient's*
-- RLS-scoped notification row. No old notifications or message bodies change.
CREATE OR REPLACE FUNCTION public.v19_queue_chat_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog
AS $body$
DECLARE v_preview text;
BEGIN
  v_preview:=LEFT(regexp_replace(btrim(COALESCE(NEW.body,'')),'[[:cntrl:]]+',' ','g'),180);
  IF v_preview='' THEN v_preview:='Enviou um anexo'; END IF;
  INSERT INTO public.chat_notifications
    (user_id,conversation_id,message_id,kind,preview,created_at)
  SELECT cp.user_id,NEW.conversation_id,NEW.id,'message',
    v_preview,NEW.created_at
  FROM public.conversation_participants cp
  WHERE cp.conversation_id=NEW.conversation_id
    AND cp.user_id<>NEW.sender_id
  ON CONFLICT (user_id,message_id) DO NOTHING;
  RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.v19_queue_chat_notifications() FROM PUBLIC,anonymous,authenticated;

-- FCM reads the exact comment excerpt only for the owner/replied-to token,
-- after confirming the same post visibility rules as the in-app inbox.
-- This function is never callable by normal application clients.
CREATE OR REPLACE FUNCTION public.v35_fcm_safe_comment_preview(
  p_event_id uuid,p_token_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $body$
 SELECT LEFT(regexp_replace(btrim(c.body),'[[:cntrl:]]+',' ','g'),120)
 FROM public.comments c
 JOIN public.posts p ON p.id=c.post_id
 JOIN public.android_fcm_tokens t ON t.id=p_token_id
 LEFT JOIN public.comments parent ON parent.id=c.parent_comment_id AND parent.post_id=c.post_id
 WHERE c.id=p_event_id AND t.user_id<>c.author_id
   AND (t.user_id=p.author_id OR t.user_id=parent.author_id)
   AND (
     p.visibility='public' OR p.author_id=t.user_id OR
     EXISTS(SELECT 1 FROM public.post_recipients pr
       WHERE pr.post_id=p.id AND pr.recipient_id=t.user_id)
   )
 LIMIT 1
$body$;
REVOKE ALL ON FUNCTION public.v35_fcm_safe_comment_preview(uuid,uuid)
  FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.v35_fcm_safe_comment_preview(uuid,uuid)
  TO looply_push_relay_limited;
NOTIFY pgrst,'reload schema';
