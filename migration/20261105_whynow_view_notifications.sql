-- 05/11/2026 | WhyNow view notification, preserving existing Highlight notifications.
BEGIN;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
 CHECK (kind IN ('post','comment','reply','music_dedication','post_like',
   'story_like','story_mention','story_view','highlight_view','gallery_comment','gallery_tag'));
CREATE OR REPLACE FUNCTION public.v40_notify_why_now_view()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_author uuid;
BEGIN
  SELECT s.author_id INTO v_author FROM public.stories s
   WHERE s.id=NEW.story_id AND s.expires_at>clock_timestamp();
  -- Highlight views already trigger separate notifications.
  IF EXISTS (SELECT 1 FROM public.story_highlights h WHERE h.story_id=NEW.story_id)
    THEN RETURN NEW; END IF;
  IF v_author IS NOT NULL AND v_author<>NEW.viewer_id THEN
    INSERT INTO public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
    VALUES(v_author,NEW.viewer_id,'story_view',NEW.story_id,
      md5('why-now:view:'||NEW.story_id::text||':'||NEW.viewer_id::text)::uuid,
      'Visualizou seu WhyNow')
    ON CONFLICT(recipient_id,kind,event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.v40_notify_why_now_view() FROM PUBLIC,anonymous,authenticated;
DROP TRIGGER IF EXISTS looply_v40_notify_why_now_view ON public.story_views;
CREATE TRIGGER looply_v40_notify_why_now_view AFTER INSERT ON public.story_views
 FOR EACH ROW EXECUTE FUNCTION public.v40_notify_why_now_view();
COMMIT;
