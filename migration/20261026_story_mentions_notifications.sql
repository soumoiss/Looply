-- Story mention references and private notifications. This is additive: existing stories, media, and notifications remain intact.
CREATE TABLE IF NOT EXISTS public.story_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_mentions_unique_user_per_story UNIQUE (story_id, mentioned_user_id),
  CONSTRAINT story_mentions_no_self CHECK (mentioned_user_id <> mentioned_by)
);

ALTER TABLE public.story_mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS story_mentions_visible_with_story ON public.story_mentions;
CREATE POLICY story_mentions_visible_with_story ON public.story_mentions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_mentions.story_id
        AND s.expires_at > now()
        AND (
          s.author_id = public.looply_legacy_uid()
          OR s.visibility = 'public'
          OR (
            s.visibility = 'selected'
            AND EXISTS (
              SELECT 1 FROM public.story_recipients r
              WHERE r.story_id = s.id
                AND r.recipient_id = public.looply_legacy_uid()
            )
          )
        )
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.story_mentions FROM authenticated;
GRANT SELECT ON public.story_mentions TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_recipient_select ON public.notifications;
CREATE POLICY notifications_recipient_select ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = public.looply_legacy_uid());
DROP POLICY IF EXISTS notifications_recipient_update ON public.notifications;
CREATE POLICY notifications_recipient_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = public.looply_legacy_uid())
  WITH CHECK (recipient_id = public.looply_legacy_uid());

-- The UI only changes read_at. All notification creation remains server-controlled.
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'post', 'comment', 'reply', 'music_dedication', 'post_like',
    'story_like', 'gallery_comment', 'gallery_tag', 'story_mention'
  ));

CREATE OR REPLACE FUNCTION public.v5_add_story_mentions(p_story_id uuid, p_user_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_id uuid := public.looply_legacy_uid();
  story_owner uuid;
  story_visibility text;
  requested_count integer := coalesce(cardinality(p_user_ids), 0);
  inserted_count integer := 0;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_count > 20
     OR (SELECT count(DISTINCT target_id) FROM unnest(coalesce(p_user_ids, '{}'::uuid[])) AS target_id) <> requested_count
     OR owner_id = ANY(coalesce(p_user_ids, '{}'::uuid[])) THEN
    RAISE EXCEPTION 'Invalid story mentions' USING ERRCODE = '22023';
  END IF;
  IF requested_count = 0 THEN
    RETURN 0;
  END IF;

  SELECT s.author_id, s.visibility
    INTO story_owner, story_visibility
  FROM public.stories s
  WHERE s.id = p_story_id AND s.expires_at > now();

  IF story_owner IS NULL OR story_owner <> owner_id THEN
    RAISE EXCEPTION 'Not authorized to mention users on this story' USING ERRCODE = '42501';
  END IF;
  IF story_visibility = 'private' THEN
    RAISE EXCEPTION 'Private stories cannot mention other users' USING ERRCODE = '42501';
  END IF;
  IF (
    SELECT count(*)
    FROM public.profiles p
    WHERE p.id = ANY(coalesce(p_user_ids, '{}'::uuid[]))
      AND p.id <> owner_id
      AND coalesce(p.profile_visibility, 'members') <> 'private'
  ) <> requested_count THEN
    RAISE EXCEPTION 'Mentioned profile is unavailable' USING ERRCODE = '22023';
  END IF;
  IF story_visibility = 'selected' AND (
    SELECT count(*)
    FROM public.story_recipients r
    WHERE r.story_id = p_story_id
      AND r.recipient_id = ANY(coalesce(p_user_ids, '{}'::uuid[]))
  ) <> requested_count THEN
    RAISE EXCEPTION 'A selected story can only mention its recipients' USING ERRCODE = '42501';
  END IF;

  WITH new_mentions AS (
    INSERT INTO public.story_mentions (story_id, mentioned_user_id, mentioned_by)
    SELECT p_story_id, target_id, owner_id
    FROM unnest(coalesce(p_user_ids, '{}'::uuid[])) AS target_id
    ON CONFLICT (story_id, mentioned_user_id) DO NOTHING
    RETURNING id, mentioned_user_id
  )
  INSERT INTO public.notifications (recipient_id, actor_id, kind, resource_id, event_id, preview)
  SELECT mentioned_user_id, owner_id, 'story_mention', p_story_id, id, 'mencionou você em um Story.'
  FROM new_mentions
  ON CONFLICT (recipient_id, kind, event_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.v5_add_story_mentions(uuid, uuid[]) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v5_add_story_mentions(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
