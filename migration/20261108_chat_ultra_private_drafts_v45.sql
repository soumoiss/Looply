-- v45 synchronized, private per-account draft text. No direct table grants, no push.
-- Drafts remain on the server only after authenticated writer confirmation.

CREATE TABLE IF NOT EXISTS public.chat_ultra_drafts (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '' CHECK (char_length(body)<=12000),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY(user_id,conversation_id));

ALTER TABLE public.chat_ultra_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_ultra_drafts FROM PUBLIC,authenticated;

CREATE OR REPLACE FUNCTION public.v45_chat_read_drafts()
RETURNS TABLE(conversation_id uuid,body text,updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
WITH actor AS MATERIALIZED(SELECT public.looply_legacy_uid() AS id)
SELECT drafts.conversation_id,drafts.body,drafts.updated_at
FROM public.chat_ultra_drafts drafts CROSS JOIN actor
WHERE actor.id IS NOT NULL AND drafts.user_id=actor.id
AND length(drafts.body)>0 AND EXISTS(SELECT 1 FROM public.conversation_participants member
  WHERE member.conversation_id=drafts.conversation_id AND member.user_id=actor.id)
ORDER BY drafts.updated_at DESC LIMIT 200;
$fn$;

CREATE OR REPLACE FUNCTION public.v45_chat_save_draft(p_conversation_id uuid,p_body text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid;
BEGIN
 actor:=public.looply_legacy_uid();
 IF actor IS NULL OR p_body IS NULL OR char_length(p_body)>12000 OR NOT EXISTS(
   SELECT 1 FROM public.conversation_participants member
   WHERE member.conversation_id=p_conversation_id AND member.user_id=actor
 ) THEN RETURN false; END IF;
 INSERT INTO public.chat_ultra_drafts(user_id,conversation_id,body,updated_at)
 VALUES(actor,p_conversation_id,p_body,pg_catalog.now())
 ON CONFLICT(user_id,conversation_id) DO UPDATE SET
 body=EXCLUDED.body,updated_at=EXCLUDED.updated_at;
 RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.v45_chat_read_drafts() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.v45_chat_save_draft(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v45_chat_read_drafts() TO authenticated;

GRANT EXECUTE ON FUNCTION public.v45_chat_save_draft(uuid,text) TO authenticated;
