-- Add the missing covering index reported by Supabase's performance advisor.
-- Keep the moderation table protected by its existing RLS/no-client-policy design.
CREATE INDEX IF NOT EXISTS looply_content_moderation_moderated_by_idx
  ON public.looply_content_moderation (moderated_by);
