-- Additive state for the Cartas model. Originals remain in archived_cards;
-- existing read records, ciphertext, attachments and audit history are preserved.
CREATE TABLE IF NOT EXISTS public.looply_letter_ui_state (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  letter_kind text NOT NULL CHECK (letter_kind IN ('archive','community')),
  letter_id uuid NOT NULL,
  favorite boolean NOT NULL DEFAULT false,
  reaction text CHECK (reaction IS NULL OR reaction IN ('❤️','🥹','😍','💜','👏','🌸')),
  read_at timestamptz,
  PRIMARY KEY (user_id,letter_kind,letter_id)
);
ALTER TABLE public.looply_letter_ui_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_letter_ui_state FROM PUBLIC,anonymous;
GRANT SELECT,INSERT,UPDATE ON public.looply_letter_ui_state TO authenticated;
DROP POLICY IF EXISTS letter_ui_owner_select ON public.looply_letter_ui_state;
CREATE POLICY letter_ui_owner_select ON public.looply_letter_ui_state FOR SELECT TO authenticated
  USING (user_id=(select public.looply_legacy_uid()));
DROP POLICY IF EXISTS letter_ui_owner_insert ON public.looply_letter_ui_state;
CREATE POLICY letter_ui_owner_insert ON public.looply_letter_ui_state FOR INSERT TO authenticated
  WITH CHECK (user_id=(select public.looply_legacy_uid()) AND
    (letter_kind='archive' AND EXISTS(SELECT 1 FROM public.archived_cards c WHERE c.id=letter_id AND c.recipient_id=user_id)
     OR letter_kind='community' AND EXISTS(SELECT 1 FROM public.community_letters c WHERE c.id=letter_id AND (c.recipient_id=user_id OR c.sender_id=user_id))));
DROP POLICY IF EXISTS letter_ui_owner_update ON public.looply_letter_ui_state;
CREATE POLICY letter_ui_owner_update ON public.looply_letter_ui_state FOR UPDATE TO authenticated
  USING (user_id=(select public.looply_legacy_uid())) WITH CHECK (user_id=(select public.looply_legacy_uid()));
-- Preserve past receipt state for older community letters.
INSERT INTO public.looply_letter_ui_state (user_id,letter_kind,letter_id,read_at)
SELECT reader_id,'community',letter_id,min(read_at)
FROM public.looply_community_letter_reads GROUP BY reader_id,letter_id
ON CONFLICT (user_id,letter_kind,letter_id) DO UPDATE
  SET read_at=COALESCE(public.looply_letter_ui_state.read_at,EXCLUDED.read_at);
ALTER TABLE public.community_letters ADD COLUMN IF NOT EXISTS model_style jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.community_letters ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false;

-- Read receipt and reaction visible only to the letter's sender or recipient.
CREATE OR REPLACE FUNCTION public.v27_letter_activity(p_letter_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_actor uuid := public.looply_legacy_uid(); v_letter public.community_letters%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_letter FROM public.community_letters WHERE id=p_letter_id
    AND (sender_id=v_actor OR recipient_id=v_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'letter_not_authorized' USING ERRCODE='42501'; END IF;
  RETURN (SELECT jsonb_build_object('read_at',r.read_at,'reaction',s.reaction)
    FROM public.community_letters l
    LEFT JOIN public.looply_community_letter_reads r ON r.letter_id=l.id AND r.reader_id=l.recipient_id
    LEFT JOIN public.looply_letter_ui_state s ON s.letter_kind='community' AND s.letter_id=l.id AND s.user_id=l.recipient_id
    WHERE l.id=p_letter_id);
END
$fn$;
REVOKE ALL ON FUNCTION public.v27_letter_activity(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v27_letter_activity(uuid) TO authenticated;
