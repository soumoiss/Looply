-- Fix for PostgreSQL: max(uuid) is not an aggregate. Keep actor validation,
-- unique active-game constraint, and all existing game records unchanged.
CREATE OR REPLACE FUNCTION public.v25_ttt_invite(p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); peer uuid; n integer; current_id uuid;
BEGIN
  IF actor IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.conversations WHERE id=p_conversation_id AND kind='direct'
  ) THEN RAISE EXCEPTION 'Direct conversation required' USING ERRCODE='42501'; END IF;
  SELECT count(*),(array_agg(user_id) FILTER (WHERE user_id<>actor))[1] INTO n,peer
  FROM public.conversation_participants WHERE conversation_id=p_conversation_id;
  IF n<>2 OR peer IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id=p_conversation_id AND user_id=actor
  ) THEN RAISE EXCEPTION 'Two verified participants required' USING ERRCODE='42501'; END IF;
  -- Expire unanswered invitations so the same conversation can start anew.
  UPDATE public.looply_ttt_games SET status='declined',turn_player=NULL,updated_at=now()
    WHERE conversation_id=p_conversation_id AND status='invited'
      AND created_at<now()-interval '30 minutes';
  INSERT INTO public.looply_ttt_games(conversation_id,x_player,o_player,invited_by,turn_player)
    VALUES(p_conversation_id,actor,peer,actor,CASE WHEN random()<0.5 THEN actor ELSE peer END)
    ON CONFLICT DO NOTHING RETURNING id INTO current_id;
  IF current_id IS NULL THEN
    SELECT id INTO current_id FROM public.looply_ttt_games
      WHERE conversation_id=p_conversation_id AND status IN ('invited','active') LIMIT 1;
  END IF;
  IF current_id IS NULL THEN RAISE EXCEPTION 'Could not start game, retry' USING ERRCODE='40001'; END IF;
  RETURN public.v25_ttt_view(current_id);
END;
$function$
;
