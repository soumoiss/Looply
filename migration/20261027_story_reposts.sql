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
  FROM identity
$$;
REVOKE ALL ON FUNCTION public.v3_can_view_story(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v3_can_view_story(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v6_set_story_repost_permission(
  p_story_id uuid,
  p_allow boolean
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT public.looply_legacy_uid() AS user_id
  ),
  changed AS (
    UPDATE public.stories story
    SET allow_reposts = p_allow
    FROM actor
    WHERE story.id = p_story_id
      AND story.author_id = actor.user_id
      AND actor.user_id IS NOT NULL
      AND p_allow IS NOT NULL
      AND story.expires_at > pg_catalog.now()
      AND (p_allow = false OR story.visibility = 'public')
      AND (
        p_allow = false
        OR EXISTS (
          SELECT 1 FROM public.story_media media
          WHERE media.story_id = story.id AND media.kind IN ('image', 'video')
        )
      )
    RETURNING true AS ok
  )
  SELECT COALESCE((SELECT changed.ok FROM changed), false)
$$;
REVOKE ALL ON FUNCTION public.v6_set_story_repost_permission(uuid, boolean) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v6_set_story_repost_permission(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.v6_link_story_repost(
  p_repost_story_id uuid,
  p_original_story_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT public.looply_legacy_uid() AS user_id
  ),
  source AS MATERIALIZED (
    SELECT original.id, original.author_id, original.expires_at
    FROM public.stories original
    CROSS JOIN actor
    WHERE original.id = p_original_story_id
      AND original.visibility = 'public'
      AND original.allow_reposts IS TRUE
      AND original.expires_at > pg_catalog.now()
      AND EXISTS (
        SELECT 1 FROM public.story_media source_media
        WHERE source_media.story_id = original.id
          AND source_media.kind IN ('image', 'video')
      )
      AND actor.user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.story_mentions mention
        WHERE mention.story_id = original.id
          AND mention.mentioned_user_id = actor.user_id
      )
    FOR SHARE OF original
  ),
  target AS MATERIALIZED (
    SELECT repost.id, CASE WHEN repost.expires_at < source.expires_at THEN repost.expires_at ELSE source.expires_at END AS expires_at,
      source.author_id AS original_author_id
    FROM public.stories repost
    CROSS JOIN actor
    CROSS JOIN source
    WHERE repost.id = p_repost_story_id
      AND repost.author_id = actor.user_id
      AND repost.expires_at > pg_catalog.now()
      AND p_repost_story_id IS DISTINCT FROM p_original_story_id
      AND EXISTS (
        SELECT 1 FROM public.story_media media
        WHERE media.story_id = repost.id
      )
  ),
  updated AS (
    UPDATE public.stories repost
    SET expires_at = target.expires_at
    FROM target
    WHERE repost.id = target.id
      AND repost.author_id = (SELECT actor.user_id FROM actor)
    RETURNING repost.id
  ),
  inserted AS (
    INSERT INTO public.story_reposts (
      repost_story_id, original_story_id, original_author_id, reposted_by
    )
    SELECT target.id, p_original_story_id, target.original_author_id, actor.user_id
    FROM target
    JOIN updated ON updated.id = target.id
    CROSS JOIN actor
    ON CONFLICT (repost_story_id) DO NOTHING
    RETURNING repost_story_id
  )
  SELECT EXISTS (SELECT 1 FROM inserted)
$$;
REVOKE ALL ON FUNCTION public.v6_link_story_repost(uuid, uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v6_link_story_repost(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
