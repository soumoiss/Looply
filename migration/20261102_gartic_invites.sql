-- Gartic invitations: an invited player explicitly accepts or declines before joining.
CREATE TABLE IF NOT EXISTS public.looply_gartic_invites (
 game_id uuid NOT NULL REFERENCES public.looply_gartic_games(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 invited_by uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 minutes'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(game_id,user_id)
);
CREATE INDEX IF NOT EXISTS looply_gartic_invites_inbox
 ON public.looply_gartic_invites(user_id,status,created_at DESC);
ALTER TABLE public.looply_gartic_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_gartic_invites FROM PUBLIC,authenticated,anonymous;

-- The game view and action functions stay SECURITY DEFINER with explicit
-- membership checks. Invites never grant access to another conversation.

CREATE OR REPLACE FUNCTION public.v26_gartic_view(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid := (SELECT public.looply_legacy_uid());
 g public.looply_gartic_games%ROWTYPE;
 word text; mask text; n int; i int; reveal boolean;
 players jsonb;
BEGIN
 SELECT * INTO g FROM public.looply_gartic_games WHERE id=p_game_id;
 IF actor IS NULL OR NOT FOUND OR NOT EXISTS(
  SELECT 1 FROM public.conversation_participants c WHERE c.conversation_id=g.conversation_id AND c.user_id=actor
 ) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT term INTO word FROM public.looply_gartic_words WHERE id=g.word_id;
 reveal:=actor=g.drawer_id OR g.status='finished';
 mask:='';
 IF word IS NOT NULL THEN
  FOR i IN 1..pg_catalog.char_length(word) LOOP
   IF reveal OR i=ANY(g.revealed) OR pg_catalog.substr(word,i,1) !~ '[[:alnum:]]' THEN
    mask:=mask||pg_catalog.substr(word,i,1);
   ELSE mask:=mask||'•'; END IF;
  END LOOP;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',coalesce(nullif(pr.display_name,''),pr.username),'username',pr.username,'avatarPath',pr.avatar_path,'score',p.score,'joinedAt',p.joined_at) ORDER BY p.joined_at,p.user_id),'[]'::jsonb)
 INTO players FROM public.looply_gartic_players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id;
 RETURN jsonb_build_object('gameId',g.id,'conversationId',g.conversation_id,'status',g.status,'hostId',g.host_id,
 'category',g.category,'duration',g.duration_seconds,'cycles',g.cycles,'turn',g.turn,
 'drawerId',g.drawer_id,'masked',mask,'word',CASE WHEN reveal THEN word ELSE NULL END,
 'lastWord',g.last_word,'endsAt',g.ends_at,'serverNow',clock_timestamp(),'players',players,
 'winnerId',g.winner_id,'revealed',cardinality(g.revealed),
 'correct', (SELECT coalesce(jsonb_agg(user_id),'[]'::jsonb) FROM public.looply_gartic_guesses
 WHERE game_id=g.id AND turn=g.turn AND correct),
 'strokes',(SELECT coalesce(jsonb_agg(s.payload ORDER BY s.id),'[]'::jsonb)
 FROM (SELECT id,payload FROM public.looply_gartic_strokes WHERE game_id=g.id AND turn=g.turn ORDER BY id DESC LIMIT 260) s),
 'chat',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'userId',c.user_id,
 'name',coalesce(nullif(p.display_name,''),p.username),'body',c.body,'at',c.created_at)
 ORDER BY c.id),'[]'::jsonb) FROM (SELECT * FROM public.looply_gartic_chat
 WHERE game_id=g.id ORDER BY id DESC LIMIT 40) c JOIN public.profiles p ON p.id=c.user_id),
 'inviteStatus',(SELECT CASE WHEN expires_at<clock_timestamp() AND status='pending' THEN 'expired' ELSE status END
   FROM public.looply_gartic_invites WHERE game_id=g.id AND user_id=actor),
 'invites',(SELECT coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'name',
  coalesce(nullif(pr.display_name,''),pr.username),'status',
  CASE WHEN i.status='pending' AND i.expires_at<clock_timestamp() THEN 'expired' ELSE i.status END)
  ORDER BY i.created_at),'[]'::jsonb)
  FROM public.looply_gartic_invites i JOIN public.profiles pr ON pr.id=i.user_id
  WHERE i.game_id=g.id),
 'updatedAt',g.updated_at);
END;
$function$

CREATE OR REPLACE FUNCTION public.v26_gartic_action(p_conversation_id uuid, p_action text, p_value text DEFAULT NULL::text, p_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); g public.looply_gartic_games%ROWTYPE;
 answer text; correct_guess boolean; count_players int; count_correct int; pos int; score_award int; total int; last_id uuid;
BEGIN
 IF actor IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.conversation_participants WHERE conversation_id=p_conversation_id AND user_id=actor
 ) THEN RAISE EXCEPTION 'Not a member of this conversation' USING ERRCODE='42501'; END IF;
 -- Serialize creation against concurrent calls for this conversation.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conversation_id::text,621026));
 SELECT * INTO g FROM public.looply_gartic_games WHERE conversation_id=p_conversation_id AND status IN ('waiting','active')
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF p_action='create' THEN
  IF g.id IS NULL THEN
   INSERT INTO public.looply_gartic_games(conversation_id,host_id,category)
   VALUES(p_conversation_id,actor,coalesce((SELECT category FROM public.looply_gartic_words
     WHERE category=coalesce(nullif(p_value,''),'animais') LIMIT 1),'animais')) RETURNING * INTO g;
   INSERT INTO public.looply_gartic_players(game_id,user_id) VALUES(g.id,actor);
   INSERT INTO public.looply_gartic_invites(game_id,user_id,invited_by)
     SELECT g.id,cp.user_id,actor FROM public.conversation_participants cp
     WHERE cp.conversation_id=p_conversation_id AND cp.user_id<>actor
     ON CONFLICT(game_id,user_id) DO NOTHING;
  END IF;
 ELSIF g.id IS NULL THEN
  IF p_action IN ('state','tick') THEN
   SELECT id INTO last_id FROM public.looply_gartic_games
    WHERE conversation_id=p_conversation_id ORDER BY created_at DESC LIMIT 1;
   IF last_id IS NULL THEN RETURN NULL; END IF;
   RETURN public.v26_gartic_view(last_id);
  END IF;
  RAISE EXCEPTION 'No active game' USING ERRCODE='22023';
 ELSIF p_action='invite' THEN
  IF g.host_id<>actor OR g.status<>'waiting' THEN
   RAISE EXCEPTION 'Only the host can invite' USING ERRCODE='42501'; END IF;
  INSERT INTO public.looply_gartic_invites(game_id,user_id,invited_by)
   SELECT g.id,cp.user_id,actor FROM public.conversation_participants cp
   WHERE cp.conversation_id=p_conversation_id AND cp.user_id<>actor
   AND NOT EXISTS(SELECT 1 FROM public.looply_gartic_players p
     WHERE p.game_id=g.id AND p.user_id=cp.user_id)
   ON CONFLICT(game_id,user_id) DO UPDATE
     SET status='pending',expires_at=clock_timestamp()+interval '30 minutes',
     updated_at=clock_timestamp(),invited_by=actor
     WHERE public.looply_gartic_invites.status<>'accepted';
  UPDATE public.looply_gartic_games SET updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action IN ('accept','join') THEN
  IF g.status<>'waiting' THEN RAISE EXCEPTION 'Game already started' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.looply_gartic_invites
   WHERE game_id=g.id AND user_id=actor AND status='pending' AND expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM public.looply_gartic_players WHERE game_id=g.id AND user_id=actor)
  THEN RAISE EXCEPTION 'A valid invitation is required' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO count_players FROM public.looply_gartic_players WHERE game_id=g.id;
  IF count_players>=6 AND NOT EXISTS(SELECT 1 FROM public.looply_gartic_players WHERE game_id=g.id AND user_id=actor)
  THEN RAISE EXCEPTION 'Room is full' USING ERRCODE='22023'; END IF;
  INSERT INTO public.looply_gartic_players(game_id,user_id) VALUES(g.id,actor) ON CONFLICT DO NOTHING;
  UPDATE public.looply_gartic_invites SET status='accepted',updated_at=clock_timestamp()
   WHERE game_id=g.id AND user_id=actor;
  UPDATE public.looply_gartic_games SET updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action='decline' THEN
  IF g.status<>'waiting' THEN RAISE EXCEPTION 'Game already started'; END IF;
  IF EXISTS(SELECT 1 FROM public.looply_gartic_players WHERE game_id=g.id AND user_id=actor)
  THEN RAISE EXCEPTION 'Already joined the game'; END IF;
  UPDATE public.looply_gartic_invites SET status='declined',updated_at=clock_timestamp()
   WHERE game_id=g.id AND user_id=actor AND status='pending';
  UPDATE public.looply_gartic_games SET updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action='configure' THEN
  IF g.host_id<>actor OR g.status<>'waiting' THEN RAISE EXCEPTION 'Only the host can configure' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.looply_gartic_words WHERE category=p_value) THEN RAISE EXCEPTION 'Invalid category'; END IF;
  UPDATE public.looply_gartic_games SET category=p_value,updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action='duration' THEN
  IF g.host_id<>actor OR g.status<>'waiting' THEN RAISE EXCEPTION 'Only the host can configure' USING ERRCODE='42501'; END IF;
  IF p_number NOT IN (45,60,75,90) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  UPDATE public.looply_gartic_games SET duration_seconds=p_number,updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action='cycles' THEN
  IF g.host_id<>actor OR g.status<>'waiting' THEN RAISE EXCEPTION 'Only the host can configure' USING ERRCODE='42501'; END IF;
  IF p_number NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid cycles'; END IF;
  UPDATE public.looply_gartic_games SET cycles=p_number,updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action='start' THEN
  IF g.host_id<>actor OR g.status<>'waiting' THEN RAISE EXCEPTION 'Only the host can start' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO count_players FROM public.looply_gartic_players WHERE game_id=g.id;
  IF count_players<2 THEN RAISE EXCEPTION 'At least two players required' USING ERRCODE='22023'; END IF;
  UPDATE public.looply_gartic_games SET status='active',updated_at=clock_timestamp() WHERE id=g.id;
  PERFORM public.v26_gartic_next(g.id);
 ELSIF p_action IN ('tick','state') THEN
  IF g.status='active' AND clock_timestamp()>=g.ends_at THEN PERFORM public.v26_gartic_next(g.id); END IF;
 ELSIF p_action='hint' THEN
  IF g.status<>'active' OR g.drawer_id<>actor OR clock_timestamp()>=g.ends_at THEN RAISE EXCEPTION 'Not your drawing turn' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.looply_gartic_guesses WHERE game_id=g.id AND turn=g.turn AND correct) THEN
   RAISE EXCEPTION 'Hints are locked after the first correct answer' USING ERRCODE='22023'; END IF;
  SELECT term INTO answer FROM public.looply_gartic_words WHERE id=g.word_id;
  IF cardinality(g.revealed)>=greatest(1,pg_catalog.length(answer)/2) THEN RAISE EXCEPTION 'Hint limit reached'; END IF;
  SELECT gs.idx INTO pos FROM generate_series(1,pg_catalog.length(answer)) AS gs(idx)
    WHERE pg_catalog.substr(answer,gs.idx,1)~'[[:alnum:]]' AND NOT(gs.idx=ANY(g.revealed)) ORDER BY random() LIMIT 1;
  IF pos IS NOT NULL THEN
   UPDATE public.looply_gartic_games SET revealed=array_append(revealed,pos),updated_at=clock_timestamp() WHERE id=g.id;
  END IF;
 ELSIF p_action='guess' THEN
  IF g.status<>'active' OR g.drawer_id=actor OR clock_timestamp()>=g.ends_at THEN RAISE EXCEPTION 'Guess not permitted' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.looply_gartic_players WHERE game_id=g.id AND user_id=actor) THEN RAISE EXCEPTION 'Join the game first'; END IF;
  IF EXISTS(SELECT 1 FROM public.looply_gartic_guesses WHERE game_id=g.id AND turn=g.turn AND user_id=actor AND correct) THEN
   RETURN public.v26_gartic_view(g.id);
  END IF;
  IF char_length(coalesce(p_value,'')) NOT BETWEEN 1 AND 96 THEN RAISE EXCEPTION 'Invalid guess'; END IF;
  IF EXISTS(SELECT 1 FROM public.looply_gartic_guesses WHERE game_id=g.id AND user_id=actor AND created_at>clock_timestamp()-interval '800 milliseconds') THEN
   RAISE EXCEPTION 'Too many guesses'; END IF;
  SELECT term INTO answer FROM public.looply_gartic_words WHERE id=g.word_id;
  correct_guess:=public.v26_gartic_normalize(p_value)=public.v26_gartic_normalize(answer);
  INSERT INTO public.looply_gartic_guesses(game_id,turn,user_id,guess,correct)
    VALUES(g.id,g.turn,actor,p_value,correct_guess);
  IF correct_guess THEN
   SELECT count(*) INTO count_correct FROM public.looply_gartic_guesses WHERE game_id=g.id AND turn=g.turn AND correct;
   score_award:=greatest(15,100+ceil(greatest(0,extract(epoch FROM (g.ends_at-clock_timestamp())))::numeric*100/g.duration_seconds)::int
      - cardinality(g.revealed)*10)+CASE WHEN count_correct=1 THEN 20 ELSE 0 END;
   UPDATE public.looply_gartic_players SET score=score+score_award WHERE game_id=g.id AND user_id=actor;
   UPDATE public.looply_gartic_players SET score=score+25 WHERE game_id=g.id AND user_id=g.drawer_id;
   UPDATE public.looply_gartic_games SET updated_at=clock_timestamp() WHERE id=g.id;
   SELECT count(*) INTO count_players FROM public.looply_gartic_players WHERE game_id=g.id;
   IF count_correct>=count_players-1 THEN PERFORM public.v26_gartic_next(g.id); END IF;
  END IF;


 ELSIF p_action='stroke' THEN
  IF g.status<>'active' OR g.drawer_id<>actor OR clock_timestamp()>=g.ends_at THEN
   RAISE EXCEPTION 'Drawing not allowed' USING ERRCODE='42501'; END IF;
  IF char_length(coalesce(p_value,''))>8000 OR char_length(coalesce(p_value,''))<8 THEN RAISE EXCEPTION 'Stroke too large'; END IF;
  IF (SELECT count(*) FROM public.looply_gartic_strokes WHERE game_id=g.id AND turn=g.turn)>=260 THEN RAISE EXCEPTION 'Drawing stroke limit reached'; END IF;
  IF jsonb_typeof(p_value::jsonb)<>'object' OR jsonb_typeof(p_value::jsonb->'points')<>'array'
    OR jsonb_array_length(p_value::jsonb->'points')>140
    OR coalesce(p_value::jsonb->>'tool','') NOT IN ('pen','eraser')
    OR coalesce(p_value::jsonb->>'color','') !~ '^#[0-9a-fA-F]{6}$'
    OR (p_value::jsonb->>'width')::integer NOT BETWEEN 1 AND 35 THEN RAISE EXCEPTION 'Invalid stroke'; END IF;
  INSERT INTO public.looply_gartic_strokes(game_id,turn,user_id,payload) VALUES(g.id,g.turn,actor,p_value::jsonb);
  UPDATE public.looply_gartic_games SET updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action='chat' THEN
  IF NOT EXISTS(SELECT 1 FROM public.looply_gartic_players WHERE game_id=g.id AND user_id=actor)
  THEN RAISE EXCEPTION 'Join the room first'; END IF;
  IF char_length(btrim(coalesce(p_value,''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid message'; END IF;
  IF EXISTS(SELECT 1 FROM public.looply_gartic_chat WHERE game_id=g.id AND user_id=actor
   AND created_at>clock_timestamp()-interval '700 milliseconds') THEN RAISE EXCEPTION 'Chat rate limit'; END IF;
  INSERT INTO public.looply_gartic_chat(game_id,user_id,body) VALUES(g.id,actor,btrim(p_value));
  UPDATE public.looply_gartic_games SET updated_at=clock_timestamp() WHERE id=g.id;
 ELSIF p_action='finish' THEN
  IF g.host_id<>actor THEN RAISE EXCEPTION 'Only the host can finish' USING ERRCODE='42501'; END IF;
  UPDATE public.looply_gartic_games SET status='finished',ends_at=NULL,updated_at=clock_timestamp(),
    winner_id=(SELECT user_id FROM public.looply_gartic_players WHERE game_id=g.id ORDER BY score DESC,joined_at LIMIT 1)
    WHERE id=g.id;
 ELSE RAISE EXCEPTION 'Unknown action' USING ERRCODE='22023'; END IF;
 RETURN public.v26_gartic_view(g.id);
END;
$function$

