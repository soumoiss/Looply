-- Looply Chat Ultra 3.0: 2..8-option polls with one authenticated vote
-- per person. No existing chat messages or emoji reactions are removed.
CREATE TABLE IF NOT EXISTS public.chat_poll_votes (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index smallint NOT NULL CHECK(option_index BETWEEN 0 AND 7),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY(message_id,user_id)
);
CREATE INDEX IF NOT EXISTS chat_poll_votes_message_idx
  ON public.chat_poll_votes(message_id, option_index);
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_poll_votes FROM PUBLIC;
REVOKE ALL ON public.chat_poll_votes FROM authenticated;

-- Preserve votes in the previous 6-emoji encoding while moving to the
-- correct poll-specific table (no deletion of legacy records).
INSERT INTO public.chat_poll_votes(message_id,user_id,option_index)
SELECT reaction.message_id,reaction.user_id,
  CASE reaction.emoji WHEN '❤️' THEN 0 WHEN '😂' THEN 1 WHEN '😮' THEN 2
    WHEN '😢' THEN 3 WHEN '🙏' THEN 4 WHEN '👍' THEN 5 END
FROM public.chat_message_reactions reaction
JOIN public.chat_messages message ON message.id=reaction.message_id
WHERE message.body LIKE '📊 Enquete Looply/1'||chr(10)||'%'
  AND reaction.emoji IN ('❤️','😂','😮','😢','🙏','👍')
ON CONFLICT(message_id,user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.v38_vote_chat_poll(p_message_id uuid,p_option integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $func$
DECLARE
  actor uuid;
  record_body text;
  payload jsonb;
  selected_conversation uuid;
  choices integer;
  poll_header constant text := '📊 Enquete Looply/1' || chr(10);
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL THEN RETURN false; END IF;
  SELECT m.body,m.conversation_id INTO record_body,selected_conversation
    FROM public.chat_messages m
    JOIN public.conversation_participants cp
      ON cp.conversation_id=m.conversation_id AND cp.user_id=actor
    WHERE m.id=p_message_id;
  IF record_body IS NULL OR left(record_body,length(poll_header))<>poll_header
    THEN RETURN false; END IF;
  IF p_option=-1 THEN
    DELETE FROM public.chat_poll_votes WHERE message_id=p_message_id AND user_id=actor;
    RETURN true;
  END IF;
  IF p_option<0 OR p_option>7 OR p_option IS NULL THEN RETURN false; END IF;
  BEGIN
    payload:=substring(record_body FROM length(poll_header)+1)::jsonb;
  EXCEPTION WHEN others THEN RETURN false; END;
  IF payload->>'v'<>'1' OR jsonb_typeof(payload->'options')<>'array' THEN RETURN false; END IF;
  choices:=jsonb_array_length(payload->'options');
  IF choices<2 OR choices>8 OR p_option>=choices THEN RETURN false; END IF;
  INSERT INTO public.chat_poll_votes(message_id,user_id,option_index)
    VALUES(p_message_id,actor,p_option)
  ON CONFLICT(message_id,user_id)
    DO UPDATE SET option_index=excluded.option_index,created_at=pg_catalog.now();
  RETURN true;
END;
$func$;
CREATE OR REPLACE FUNCTION public.v38_chat_poll_votes(
  p_conversation_id uuid,p_message_ids uuid[]
)
RETURNS TABLE(message_id uuid,user_id uuid,option_index smallint)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $func$
  SELECT vote.message_id,vote.user_id,vote.option_index
    FROM public.chat_poll_votes vote
    JOIN public.chat_messages message ON message.id=vote.message_id
    WHERE message.conversation_id=p_conversation_id
      AND vote.message_id=ANY(p_message_ids)
      AND coalesce(cardinality(p_message_ids),0) BETWEEN 1 AND 100
      AND EXISTS (
        SELECT 1 FROM public.conversation_participants member
        WHERE member.conversation_id=p_conversation_id
          AND member.user_id=public.looply_legacy_uid()
      )
    LIMIT 2000;
$func$;
REVOKE ALL ON FUNCTION public.v38_vote_chat_poll(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v38_chat_poll_votes(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v38_vote_chat_poll(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v38_chat_poll_votes(uuid,uuid[]) TO authenticated;