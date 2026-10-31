-- Looply v25: authenticated, authoritative tic-tac-toe.
-- Retains every historical chat_ttt_results row. No client can invent wins.
CREATE TABLE IF NOT EXISTS public.looply_ttt_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  x_player uuid NOT NULL REFERENCES public.profiles(id),
  o_player uuid NOT NULL REFERENCES public.profiles(id),
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  turn_player uuid REFERENCES public.profiles(id),
  board text[] NOT NULL DEFAULT array_fill(''::text,ARRAY[9]),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','finished','declined')),
  winner_id uuid REFERENCES public.profiles(id),
  is_draw boolean NOT NULL DEFAULT false,
  round integer NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 1000000),
  previous_game_id uuid UNIQUE REFERENCES public.looply_ttt_games(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (x_player <> o_player),
  CHECK (invited_by IN (x_player,o_player)),
  CHECK (turn_player IS NULL OR turn_player IN (x_player,o_player)),
  CHECK (winner_id IS NULL OR winner_id IN (x_player,o_player)),
  CHECK (array_length(board,1)=9)
);
CREATE UNIQUE INDEX IF NOT EXISTS looply_ttt_one_live_game_per_conversation
  ON public.looply_ttt_games(conversation_id) WHERE status IN ('invited','active');
CREATE INDEX IF NOT EXISTS looply_ttt_games_latest_idx
  ON public.looply_ttt_games(conversation_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS looply_ttt_results_pair_idx
  ON public.chat_ttt_results(conversation_id,x_player,o_player,created_at DESC);

ALTER TABLE public.looply_ttt_games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_ttt_games FROM PUBLIC,anonymous,authenticated;
GRANT SELECT ON public.looply_ttt_games TO authenticated;
CREATE POLICY looply_ttt_verified_participants_read ON public.looply_ttt_games
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id=looply_ttt_games.conversation_id
      AND cp.user_id=(SELECT public.looply_legacy_uid())
  ));

-- The historical results table was enabled for RLS but had no SELECT policy
-- and still exposed direct DML to authenticated clients. Fix both without
-- deleting, modifying, or replacing historical results.
CREATE POLICY looply_ttt_results_verified_participants_read ON public.chat_ttt_results
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id=chat_ttt_results.conversation_id
      AND cp.user_id=(SELECT public.looply_legacy_uid())
  ));
REVOKE INSERT,UPDATE,DELETE ON public.chat_ttt_results FROM authenticated;

-- Names and scores must come from the verified database, never from events.
CREATE OR REPLACE FUNCTION public.v25_ttt_view(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  actor uuid:=(SELECT public.looply_legacy_uid());
  g public.looply_ttt_games%ROWTYPE;
  xprof public.profiles%ROWTYPE;
  oprof public.profiles%ROWTYPE;
  xwins integer; owins integer; draws integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM public.looply_ttt_games WHERE id=p_game_id;
  IF NOT FOUND OR actor NOT IN (g.x_player,g.o_player) OR NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id=g.conversation_id AND cp.user_id=actor
  ) THEN RAISE EXCEPTION 'Game unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO xprof FROM public.profiles WHERE id=g.x_player;
  SELECT * INTO oprof FROM public.profiles WHERE id=g.o_player;
  SELECT count(*) FILTER(WHERE winner_id=g.x_player),
         count(*) FILTER(WHERE winner_id=g.o_player),
         count(*) FILTER(WHERE is_draw)
    INTO xwins,owins,draws
  FROM public.chat_ttt_results r WHERE r.conversation_id=g.conversation_id
    AND ((r.x_player=g.x_player AND r.o_player=g.o_player)
      OR (r.x_player=g.o_player AND r.o_player=g.x_player));
  RETURN jsonb_build_object(
    'gameId',g.id,'conversationId',g.conversation_id,
    'status',g.status,'board',to_jsonb(g.board),'turn',g.turn_player,
    'winnerId',g.winner_id,'isDraw',g.is_draw,
    'round',g.round,'updatedAt',g.updated_at,'invitedBy',g.invited_by,
    'xPlayer',g.x_player,'oPlayer',g.o_player,
    'x',jsonb_build_object('id',xprof.id,'name',xprof.display_name,'username',xprof.username,'avatarPath',xprof.avatar_path),
    'o',jsonb_build_object('id',oprof.id,'name',oprof.display_name,'username',oprof.username,'avatarPath',oprof.avatar_path),
    'score',jsonb_build_object('x',xwins,'o',owins,'draws',draws)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.v25_ttt_state(p_conversation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); latest uuid;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_participants cp ON cp.conversation_id=c.id
    WHERE c.id=p_conversation_id AND c.kind='direct' AND cp.user_id=actor
  ) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='42501'; END IF;
  SELECT id INTO latest FROM public.looply_ttt_games
    WHERE conversation_id=p_conversation_id
    ORDER BY (status IN ('invited','active')) DESC,updated_at DESC,id DESC LIMIT 1;
  IF latest IS NULL THEN RETURN NULL; END IF;
  RETURN public.v25_ttt_view(latest);
END;
$$;

CREATE OR REPLACE FUNCTION public.v25_ttt_invite(p_conversation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); peer uuid; n integer; current_id uuid;
BEGIN
  IF actor IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.conversations WHERE id=p_conversation_id AND kind='direct'
  ) THEN RAISE EXCEPTION 'Direct conversation required' USING ERRCODE='42501'; END IF;
  SELECT count(*),max(CASE WHEN user_id<>actor THEN user_id END) INTO n,peer
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
    VALUES(p_conversation_id,actor,peer,actor,actor)
    ON CONFLICT DO NOTHING RETURNING id INTO current_id;
  IF current_id IS NULL THEN
    SELECT id INTO current_id FROM public.looply_ttt_games
      WHERE conversation_id=p_conversation_id AND status IN ('invited','active') LIMIT 1;
  END IF;
  IF current_id IS NULL THEN RAISE EXCEPTION 'Could not start game, retry' USING ERRCODE='40001'; END IF;
  RETURN public.v25_ttt_view(current_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.v25_ttt_accept(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); g public.looply_ttt_games%ROWTYPE;
BEGIN
  SELECT * INTO g FROM public.looply_ttt_games WHERE id=p_game_id FOR UPDATE;
  IF actor IS NULL OR NOT FOUND OR actor NOT IN (g.x_player,g.o_player) OR actor=g.invited_by THEN
    RAISE EXCEPTION 'Only invited player can accept' USING ERRCODE='42501';
  END IF;
  IF g.status='invited' THEN
    IF g.created_at<now()-interval '30 minutes' THEN
      RAISE EXCEPTION 'Invitation expired' USING ERRCODE='22023';
    END IF;
    UPDATE public.looply_ttt_games SET status='active',updated_at=clock_timestamp()
      WHERE id=p_game_id;
  ELSIF g.status<>'active' THEN
    RAISE EXCEPTION 'Invitation not active' USING ERRCODE='22023';
  END IF;
  RETURN public.v25_ttt_view(p_game_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.v25_ttt_decline(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); g public.looply_ttt_games%ROWTYPE;
BEGIN
  SELECT * INTO g FROM public.looply_ttt_games WHERE id=p_game_id FOR UPDATE;
  IF actor IS NULL OR NOT FOUND OR actor NOT IN (g.x_player,g.o_player) THEN
    RAISE EXCEPTION 'Not a game participant' USING ERRCODE='42501'; END IF;
  IF g.status='invited' THEN
    UPDATE public.looply_ttt_games SET status='declined',turn_player=NULL,updated_at=clock_timestamp()
      WHERE id=p_game_id;
  ELSIF g.status NOT IN ('declined','finished') THEN
    RAISE EXCEPTION 'Active games must finish on the board' USING ERRCODE='22023';
  END IF;
  RETURN public.v25_ttt_view(p_game_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.v25_ttt_move(p_game_id uuid,p_cell integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  actor uuid:=(SELECT public.looply_legacy_uid());
  g public.looply_ttt_games%ROWTYPE;
  updated_board text[]; mark text; outcome text:=NULL;
  line integer[]; won uuid; is_tie boolean:=false;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM public.looply_ttt_games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR actor NOT IN (g.x_player,g.o_player) OR g.status<>'active' THEN
    RAISE EXCEPTION 'Game unavailable' USING ERRCODE='42501';
  END IF;
  IF actor<>g.turn_player THEN RAISE EXCEPTION 'Not your turn' USING ERRCODE='22023'; END IF;
  IF p_cell IS NULL OR p_cell NOT BETWEEN 0 AND 8 OR g.board[p_cell+1]<>'' THEN
    RAISE EXCEPTION 'Invalid or occupied cell' USING ERRCODE='22023';
  END IF;
  mark:=CASE WHEN actor=g.x_player THEN 'X' ELSE 'O' END;
  updated_board:=g.board;
  updated_board[p_cell+1]:=mark;
  FOREACH line SLICE 1 IN ARRAY ARRAY[
    [1,2,3],[4,5,6],[7,8,9],
    [1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]
  ] LOOP
    IF updated_board[line[1]]<>'' AND updated_board[line[1]]=updated_board[line[2]]
       AND updated_board[line[1]]=updated_board[line[3]] THEN
      outcome:=updated_board[line[1]]; EXIT;
    END IF;
  END LOOP;
  IF outcome IS NOT NULL THEN
    won:=CASE WHEN outcome='X' THEN g.x_player ELSE g.o_player END;
  ELSIF array_position(updated_board,'') IS NULL THEN is_tie:=true;
  END IF;
  UPDATE public.looply_ttt_games SET board=updated_board,
    status=CASE WHEN won IS NOT NULL OR is_tie THEN 'finished' ELSE 'active' END,
    turn_player=CASE WHEN won IS NOT NULL OR is_tie THEN NULL
      WHEN actor=g.x_player THEN g.o_player ELSE g.x_player END,
    winner_id=won,is_draw=is_tie,updated_at=clock_timestamp()
  WHERE id=g.id;
  IF won IS NOT NULL OR is_tie THEN
    INSERT INTO public.chat_ttt_results(game_id,conversation_id,x_player,o_player,winner_id,is_draw)
    VALUES(g.id,g.conversation_id,g.x_player,g.o_player,won,is_tie)
    ON CONFLICT (game_id) DO NOTHING;
  END IF;
  RETURN public.v25_ttt_view(g.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.v25_ttt_rematch(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); g public.looply_ttt_games%ROWTYPE;
  new_id uuid; next_x uuid; next_o uuid;
BEGIN
  SELECT * INTO g FROM public.looply_ttt_games WHERE id=p_game_id FOR UPDATE;
  IF actor IS NULL OR NOT FOUND OR actor NOT IN (g.x_player,g.o_player) THEN
    RAISE EXCEPTION 'Not a game participant' USING ERRCODE='42501';
  END IF;
  IF g.status<>'finished' THEN
    RAISE EXCEPTION 'Finish this game before a rematch' USING ERRCODE='22023';
  END IF;
  SELECT id INTO new_id FROM public.looply_ttt_games WHERE previous_game_id=g.id;
  IF new_id IS NOT NULL THEN RETURN public.v25_ttt_view(new_id); END IF;
  next_x:=COALESCE(g.winner_id,g.o_player);
  next_o:=CASE WHEN next_x=g.x_player THEN g.o_player ELSE g.x_player END;
  INSERT INTO public.looply_ttt_games(conversation_id,x_player,o_player,invited_by,turn_player,round,previous_game_id,status)
  VALUES(g.conversation_id,next_x,next_o,actor,next_x,g.round+1,g.id,'invited')
  ON CONFLICT DO NOTHING RETURNING id INTO new_id;
  IF new_id IS NULL THEN
    SELECT id INTO new_id FROM public.looply_ttt_games WHERE previous_game_id=g.id LIMIT 1;
  END IF;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Another game is active' USING ERRCODE='22023'; END IF;
  RETURN public.v25_ttt_view(new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.v25_ttt_view(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v25_ttt_state(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v25_ttt_invite(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v25_ttt_accept(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v25_ttt_decline(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v25_ttt_move(uuid,integer) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v25_ttt_rematch(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v25_ttt_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v25_ttt_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v25_ttt_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v25_ttt_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v25_ttt_decline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v25_ttt_move(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v25_ttt_rematch(uuid) TO authenticated;
