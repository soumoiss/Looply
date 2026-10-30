-- Notify other Looply accounts when a public Story is newly published.
-- Selected/private Stories never enter this feed-wide queue.
CREATE TABLE IF NOT EXISTS public.android_fcm_story_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT android_fcm_story_recipient_unique UNIQUE(story_id,recipient_id)
);
ALTER TABLE public.android_fcm_story_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.android_fcm_story_events FROM PUBLIC,anonymous,authenticated;
GRANT SELECT ON public.android_fcm_story_events TO looply_push_dispatcher;
CREATE POLICY looply_push_story_delivery_read ON public.android_fcm_story_events
  FOR SELECT TO looply_push_dispatcher USING(true);

CREATE OR REPLACE FUNCTION public.v17_enqueue_public_story_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF NEW.visibility='public' THEN
    INSERT INTO public.android_fcm_story_events(story_id,recipient_id)
    SELECT NEW.id,p.id FROM public.profiles p
    WHERE p.id<>NEW.author_id
    ON CONFLICT (story_id,recipient_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.v17_enqueue_public_story_push() FROM PUBLIC,anonymous,authenticated;
CREATE TRIGGER looply_android_fcm_public_stories
AFTER INSERT ON public.stories
FOR EACH ROW EXECUTE FUNCTION public.v17_enqueue_public_story_push();
