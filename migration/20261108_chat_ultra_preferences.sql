-- Looply Chat Ultra: private per-account preferences for each authorized conversation.
-- No existing messages, members, storage objects, or profiles are modified.
CREATE TABLE IF NOT EXISTS public.chat_ultra_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  wallpaper text NOT NULL DEFAULT '' CHECK (wallpaper = '' OR wallpaper = 'gallery' OR wallpaper ~ '^#[0-9a-fA-F]{6}$'),
  wallpaper_path text,
  wallpaper_tint numeric(4,3) NOT NULL DEFAULT 0.180 CHECK (wallpaper_tint BETWEEN 0.040 AND 0.700),
  bubble_color text NOT NULL DEFAULT '' CHECK (bubble_color = '' OR bubble_color ~ '^#[0-9a-fA-F]{6}$'),
  is_pinned boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  is_favorite boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,conversation_id),
  CONSTRAINT chat_ultra_wallpaper_path_scoped CHECK (
    wallpaper_path IS NULL OR
    wallpaper_path ~ (
      '^chat-wallpapers/' || user_id::text || '/' || conversation_id::text ||
      '/[0-9a-f-]{36}\.webp$'
    )
  ),
  CONSTRAINT chat_ultra_wallpaper_path_requires_photo CHECK (
    wallpaper_path IS NULL OR wallpaper = 'gallery'
  )
);
CREATE INDEX IF NOT EXISTS chat_ultra_preferences_user_idx ON public.chat_ultra_preferences(user_id);
ALTER TABLE public.chat_ultra_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_ultra_preferences FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_ultra_preferences TO authenticated;
CREATE POLICY chat_ultra_preferences_select ON public.chat_ultra_preferences
  FOR SELECT TO authenticated USING (
    user_id = public.looply_legacy_uid()
    AND public.v3_is_conversation_participant(conversation_id)
    AND public.looply_maintenance_allowed()
  );
CREATE POLICY chat_ultra_preferences_insert ON public.chat_ultra_preferences
  FOR INSERT TO authenticated WITH CHECK (
    user_id = public.looply_legacy_uid()
    AND public.v3_is_conversation_participant(conversation_id)
    AND public.looply_maintenance_allowed()
  );
CREATE POLICY chat_ultra_preferences_update ON public.chat_ultra_preferences
  FOR UPDATE TO authenticated USING (
    user_id = public.looply_legacy_uid()
    AND public.v3_is_conversation_participant(conversation_id)
    AND public.looply_maintenance_allowed()
  ) WITH CHECK (
    user_id = public.looply_legacy_uid()
    AND public.v3_is_conversation_participant(conversation_id)
    AND public.looply_maintenance_allowed()
  );
CREATE POLICY chat_ultra_preferences_delete ON public.chat_ultra_preferences
  FOR DELETE TO authenticated USING (
    user_id = public.looply_legacy_uid()
    AND public.v3_is_conversation_participant(conversation_id)
    AND public.looply_maintenance_allowed()
  );