-- Additive Neon migration, already applied to the production branch.
-- User identifiers are verified legacy profile UUIDs, never browser-supplied admin claims.
CREATE TABLE IF NOT EXISTS public.conversation_nicknames (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  nickname text NOT NULL CHECK (char_length(btrim(nickname)) BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.conversation_nicknames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversation_nicknames FROM PUBLIC, anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_nicknames TO authenticated;
CREATE POLICY looply_nicknames_read ON public.conversation_nicknames FOR SELECT TO authenticated
 USING (user_id = (SELECT public.looply_legacy_uid()) AND public.v3_is_conversation_participant(conversation_id));
CREATE POLICY looply_nicknames_insert ON public.conversation_nicknames FOR INSERT TO authenticated
 WITH CHECK (user_id = (SELECT public.looply_legacy_uid()) AND public.v3_is_conversation_participant(conversation_id));
CREATE POLICY looply_nicknames_update ON public.conversation_nicknames FOR UPDATE TO authenticated
 USING (user_id = (SELECT public.looply_legacy_uid()) AND public.v3_is_conversation_participant(conversation_id))
 WITH CHECK (user_id = (SELECT public.looply_legacy_uid()) AND public.v3_is_conversation_participant(conversation_id));
CREATE POLICY looply_nicknames_delete ON public.conversation_nicknames FOR DELETE TO authenticated
 USING (user_id = (SELECT public.looply_legacy_uid()) AND public.v3_is_conversation_participant(conversation_id));
