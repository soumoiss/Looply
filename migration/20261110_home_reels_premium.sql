-- Looply — Início/Reels premium. Migração ADITIVA para Neon.
-- Aplicar após migration/20261029_profile_social.sql e migration/20261108_chat_ultra_server_blocks.sql.
-- Nenhum DELETE de dados preexistentes; RLS e identidade legada permanecem em vigor.
CREATE TABLE IF NOT EXISTS public.post_reactions (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('❤️','😂','😮','😢','🔥','👏')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id,user_id)
);
CREATE INDEX IF NOT EXISTS post_reactions_recent_idx ON public.post_reactions(post_id,created_at DESC);
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.post_reactions FROM PUBLIC,authenticated;
GRANT SELECT ON public.post_reactions TO authenticated;
DROP POLICY IF EXISTS premium_post_reactions_read ON public.post_reactions;
CREATE POLICY premium_post_reactions_read ON public.post_reactions FOR SELECT TO authenticated USING (
  public.looply_legacy_uid() IS NOT NULL AND public.v3_can_view_post(post_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.chat_user_blocks b WHERE
      (b.user_id=public.looply_legacy_uid() AND b.blocked_user_id=user_id)
      OR (b.blocked_user_id=public.looply_legacy_uid() AND b.user_id=user_id)
  )
);
CREATE TABLE IF NOT EXISTS public.post_saves (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id,user_id)
);
CREATE INDEX IF NOT EXISTS post_saves_member_recent_idx ON public.post_saves(user_id,created_at DESC);
ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.post_saves FROM PUBLIC,authenticated;
GRANT SELECT ON public.post_saves TO authenticated;
DROP POLICY IF EXISTS premium_post_saves_read ON public.post_saves;
CREATE POLICY premium_post_saves_read ON public.post_saves FOR SELECT TO authenticated
 USING (user_id=public.looply_legacy_uid() AND public.v3_can_view_post(post_id));

-- Uma operação por intenção: inserir/trocar/remover uma reação também sincroniza post_likes.
-- SECURITY DEFINER faz a mutação atômica; o ator é sempre derivado do JWT.
CREATE OR REPLACE FUNCTION public.v13_set_post_reaction(p_post_id uuid,p_emoji text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=public.looply_legacy_uid(); likes integer;
BEGIN
 IF actor IS NULL OR p_post_id IS NULL
   OR (p_emoji IS NOT NULL AND p_emoji NOT IN ('❤️','😂','😮','😢','🔥','👏'))
   OR NOT public.v3_can_view_post(p_post_id) THEN
   RAISE EXCEPTION 'Operação não autorizada' USING ERRCODE='42501';
 END IF;
 IF EXISTS (
   SELECT 1 FROM public.posts p JOIN public.chat_user_blocks b ON
     (b.user_id=actor AND b.blocked_user_id=p.author_id)
     OR (b.blocked_user_id=actor AND b.user_id=p.author_id)
   WHERE p.id=p_post_id
 ) THEN RAISE EXCEPTION 'Conta bloqueada' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':'||p_post_id::text,13));
 IF p_emoji IS NULL THEN
   DELETE FROM public.post_reactions WHERE post_id=p_post_id AND user_id=actor;
   DELETE FROM public.post_likes WHERE post_id=p_post_id AND user_id=actor;
 ELSE
   INSERT INTO public.post_likes(post_id,user_id) VALUES(p_post_id,actor) ON CONFLICT DO NOTHING;
   INSERT INTO public.post_reactions(post_id,user_id,emoji) VALUES(p_post_id,actor,p_emoji)
   ON CONFLICT(post_id,user_id) DO UPDATE SET emoji=EXCLUDED.emoji,updated_at=now();
 END IF;
 SELECT count(*) INTO likes FROM public.post_likes WHERE post_id=p_post_id;
 RETURN jsonb_build_object('postId',p_post_id,'emoji',p_emoji,'count',likes);
END $$;

-- Salvar e remover são idempotentes, não alteram a publicação.
CREATE OR REPLACE FUNCTION public.v13_set_post_saved(p_post_id uuid,p_saved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=public.looply_legacy_uid();
BEGIN
 IF actor IS NULL OR p_post_id IS NULL OR p_saved IS NULL THEN
   RAISE EXCEPTION 'Operação não autorizada' USING ERRCODE='42501'; END IF;
 IF p_saved THEN
   IF NOT public.v3_can_view_post(p_post_id) THEN
     RAISE EXCEPTION 'Publicação indisponível' USING ERRCODE='42501'; END IF;
   INSERT INTO public.post_saves(post_id,user_id) VALUES(p_post_id,actor) ON CONFLICT DO NOTHING;
 ELSE
   DELETE FROM public.post_saves WHERE post_id=p_post_id AND user_id=actor;
 END IF;
 RETURN p_saved;
END $$;

-- Quem curtiu: leitura paginada com contador verdadeiro e reações agregadas.
-- RLS da publicação + bloqueios filtrados antes de contar/paginar. Nenhum email/tokens expostos.
CREATE OR REPLACE FUNCTION public.v13_post_engagement_page(
  p_post_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 25,
  p_search text DEFAULT '',p_following_only boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=public.looply_legacy_uid(); result jsonb;
BEGIN
 IF actor IS NULL OR p_post_id IS NULL OR NOT public.v3_can_view_post(p_post_id) THEN
   RAISE EXCEPTION 'Publicação indisponível' USING ERRCODE='42501'; END IF;
 WITH visible_likes AS (
   SELECT l.user_id,l.created_at,COALESCE(r.emoji,'❤️') emoji,
     p.username,p.display_name,p.avatar_path,
     EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id=actor AND f.following_id=l.user_id) following
   FROM public.post_likes l
   JOIN public.profiles p ON p.id=l.user_id
   LEFT JOIN public.post_reactions r ON r.post_id=l.post_id AND r.user_id=l.user_id
   WHERE l.post_id=p_post_id
     AND NOT EXISTS(SELECT 1 FROM public.chat_user_blocks b
       WHERE (b.user_id=actor AND b.blocked_user_id=l.user_id)
          OR (b.blocked_user_id=actor AND b.user_id=l.user_id))
 ), matched AS (
    SELECT * FROM visible_likes
    WHERE (COALESCE(p_search,'')='' OR username ILIKE '%'||left(p_search,80)||'%'
           OR display_name ILIKE '%'||left(p_search,80)||'%')
       AND (NOT p_following_only OR following)
 ), page AS (
    SELECT * FROM matched ORDER BY created_at DESC,user_id DESC
    LIMIT LEAST(GREATEST(p_limit,1),50) OFFSET GREATEST(p_offset,0)
 )
 SELECT jsonb_build_object(
   'total',(SELECT count(*) FROM matched),
   'summary',COALESCE((SELECT jsonb_object_agg(emoji,total) FROM
      (SELECT emoji,count(*) total FROM visible_likes GROUP BY emoji) s),'{}'::jsonb),
   'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',user_id,'username',username,'display_name',display_name,'avatar_path',avatar_path,
      'created_at',created_at,'emoji',emoji,'isFollowing',following)
      ORDER BY created_at DESC,user_id DESC) FROM page),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.v13_set_post_reaction(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v13_set_post_saved(uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v13_post_engagement_page(uuid,integer,integer,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v13_set_post_reaction(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v13_set_post_saved(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v13_post_engagement_page(uuid,integer,integer,text,boolean) TO authenticated;
