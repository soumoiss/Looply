-- Repost consent is opt-in. Stories can only be reposted after a mention and while the
-- original remains public, active, and explicitly opted in.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS allow_reposts boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.story_reposts (
  repost_story_id uuid PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE,
  original_story_id uuid NOT NULL,
  original_author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reposted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_reposts_no_self CHECK (repost_story_id <> original_story_id)
);
CREATE INDEX IF NOT EXISTS story_reposts_original_idx
  ON public.story_reposts (original_story_id);
ALTER TABLE public.story_reposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS story_reposts_visible_with_consent ON public.story_reposts;
CREATE POLICY story_reposts_visible_with_consent ON public.story_reposts
  FOR SELECT TO authenticated
  USING (
    public.v3_can_view_story(repost_story_id)
    AND EXISTS (
      SELECT 1 FROM public.stories source
      WHERE source.id = story_reposts.original_story_id
        AND source.visibility = 'public'
        AND source.allow_reposts = true
        AND source.expires_at > now()
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.story_reposts FROM PUBLIC, anonymous, authenticated;
GRANT SELECT ON public.story_reposts TO authenticated;

CREATE OR REPLACE FUNCTION public.v3_can_view_story(p_story_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH identity AS (
    SELECT public.looply_legacy_uid() AS user_id
  )
  SELECT identity.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.stories story
      WHERE story.id = p_story_id
        AND story.expires_at > pg_catalog.now()
        AND (
          story.author_id = identity.user_id
          OR (
            (
              story.visibility = 'public'
              OR (
                story.visibility = 'selected'
                AND EXISTS (
                  SELECT 1 FROM public.story_recipients recipient
                  WHERE recipient.story_id = story.id
                    AND recipient.recipient_id = identity.user_id
                )
              )
            )
            AND (
              NOT EXISTS (
                SELECT 1 FROM public.story_reposts repost
                WHERE repost.repost_story_id = story.id
              )
              OR EXISTS (
                SELECT 1
                FROM public.story_reposts repost
                JOIN public.stories original
                  ON original.id = repost.original_story_id
                WHERE repost.repost_story_id = story.id
                  AND original.visibility = 'public'
                  AND original.allow_reposts = true
                  AND original.expires_at > pg_catalog.now()
              )
            )
          )
        )
    )
  FROM identity;
$$;
REVOKE ALL ON FUNCTION public.v3_can_view_story(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v3_can_view_story(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v6_set_story_repost_permission(
  p_story_id uuid,
  p_allow boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_id uuid := public.looply_legacy_uid();
  story_visibility text;
BEGIN
  IF owner_id IS NULL OR p_allow IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT visibility INTO story_visibility
  FROM public.stories
  WHERE id = p_story_id
    AND author_id = owner_id
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Story unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_allow AND story_visibility <> 'public' THEN
    RAISE EXCEPTION 'Only public stories can be reposted' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stories
  SET allow_reposts = p_allow
  WHERE id = p_story_id AND author_id = owner_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.v6_set_story_repost_permission(uuid, boolean) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v6_set_story_repost_permission(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.v6_link_story_repost(
  p_repost_story_id uuid,
  p_original_story_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_id uuid := public.looply_legacy_uid();
  original_author uuid;
  original_visibility text;
  original_allows boolean;
  original_expiry timestamptz;
  repost_expiry timestamptz;
BEGIN
  IF owner_id IS NULL OR p_repost_story_id IS NULL OR p_original_story_id IS NULL
     OR p_repost_story_id = p_original_story_id THEN
    RAISE EXCEPTION 'Invalid story repost' USING ERRCODE = '22023';
  END IF;

  SELECT author_id, visibility, allow_reposts, expires_at
  INTO original_author, original_visibility, original_allows, original_expiry
  FROM public.stories
  WHERE id = p_original_story_id
  FOR UPDATE;

  IF original_author IS NULL OR original_visibility <> 'public'
     OR original_allows IS DISTINCT FROM true OR original_expiry <= now() THEN
    RAISE EXCEPTION 'Original story does not allow reposts' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.story_mentions mention
    WHERE mention.story_id = p_original_story_id
      AND mention.mentioned_user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'Only a mentioned user can repost this story' USING ERRCODE = '42501';
  END IF;

  SELECT expires_at INTO repost_expiry
  FROM public.stories
  WHERE id = p_repost_story_id
    AND author_id = owner_id
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repost story unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.story_media media
    WHERE media.story_id = p_repost_story_id
  ) THEN
    RAISE EXCEPTION 'Repost must include copied media' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stories
  SET expires_at = LEAST(repost_expiry, original_expiry)
  WHERE id = p_repost_story_id AND author_id = owner_id;

  INSERT INTO public.story_reposts (
    repost_story_id, original_story_id, original_author_id, reposted_by
  ) VALUES (
    p_repost_story_id, p_original_story_id, original_author, owner_id
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.v6_link_story_repost(uuid, uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v6_link_story_repost(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
