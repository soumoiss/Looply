-- Profile social graph and media projection. Neon identities retain their legacy UUID.
-- No changes to existing accounts, media, or authentication providers.
CREATE TABLE IF NOT EXISTS public.follows (
 follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (follower_id,following_id),
 CHECK (follower_id<>following_id)
);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows(following_id,created_at DESC);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON public.follows FROM authenticated;
GRANT SELECT ON public.follows TO authenticated;
CREATE POLICY profile_follows_member_read ON public.follows FOR SELECT TO authenticated
 USING ((SELECT public.looply_legacy_uid()) IS NOT NULL);
-- Writes intentionally available only through the idempotent, actor-bound RPC below.

CREATE TABLE IF NOT EXISTS public.post_mentions (
 post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,person_id)
);
CREATE INDEX IF NOT EXISTS post_mentions_person_idx ON public.post_mentions(person_id,post_id);
ALTER TABLE public.post_mentions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.post_mentions TO authenticated;
CREATE POLICY profile_post_mentions_read ON public.post_mentions FOR SELECT TO authenticated
 USING (public.v3_can_view_post(post_id));

CREATE OR REPLACE FUNCTION public.v11_index_post_mentions() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.post_mentions WHERE post_id=NEW.id;
 INSERT INTO public.post_mentions(post_id,person_id)
 SELECT DISTINCT NEW.id,p.id FROM pg_catalog.regexp_matches(COALESCE(NEW.body,''),'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])','g') AS m
 JOIN public.profiles p ON lower(p.username)=lower(m[2])
 WHERE p.id<>NEW.author_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v11_index_post_mentions() FROM PUBLIC;
CREATE TRIGGER profile_post_mentions_sync AFTER INSERT OR UPDATE OF body ON public.posts
 FOR EACH ROW EXECUTE FUNCTION public.v11_index_post_mentions();
-- Index existing captions without modifying publications.
INSERT INTO public.post_mentions(post_id,person_id)
 SELECT DISTINCT post.id,p.id FROM public.posts post
 CROSS JOIN LATERAL pg_catalog.regexp_matches(COALESCE(post.body,''),'(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])','g') m
 JOIN public.profiles p ON lower(p.username)=lower(m[2]) WHERE p.id<>post.author_id
 ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.v11_profile_overview(p_profile_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('profile',jsonb_build_object('id',p.id,'username',p.username,
 'display_name',p.display_name,'bio',p.bio,'avatar_path',p.avatar_path),
 'posts',(SELECT count(*) FROM public.posts post WHERE post.author_id=p.id
 AND EXISTS(SELECT 1 FROM public.post_media m WHERE m.post_id=post.id))+
 (SELECT count(*) FROM public.community_gallery_media g WHERE g.owner_id=p.id AND g.publication_state='published'),
 'followers',(SELECT count(*) FROM public.follows f WHERE f.following_id=p.id),
 'following',(SELECT count(*) FROM public.follows f WHERE f.follower_id=p.id),
 'isFollowing',EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id=public.looply_legacy_uid() AND f.following_id=p.id))
 FROM public.profiles p WHERE p.id=p_profile_id AND public.looply_legacy_uid() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.v11_set_follow(p_target_id uuid,p_follow boolean) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=public.looply_legacy_uid();
BEGIN
 IF actor IS NULL OR p_target_id IS NULL OR actor=p_target_id OR p_follow IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_target_id) THEN
 RAISE EXCEPTION 'Invalid follow request' USING ERRCODE='42501'; END IF;
 -- Serialize an actor's actions, including duplicate requests from different tabs.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,11));
 IF p_follow THEN INSERT INTO public.follows(follower_id,following_id) VALUES(actor,p_target_id) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.follows WHERE follower_id=actor AND following_id=p_target_id; END IF;
 RETURN jsonb_build_object('targetId',p_target_id,'isFollowing',p_follow,
 'followers',(SELECT count(*) FROM public.follows WHERE following_id=p_target_id),
 'following',(SELECT count(*) FROM public.follows WHERE follower_id=p_target_id),
 'actorFollowing',(SELECT count(*) FROM public.follows WHERE follower_id=actor));
END $$;

CREATE OR REPLACE FUNCTION public.v11_profile_connections(p_profile_id uuid,p_kind text,p_offset integer DEFAULT 0,p_limit integer DEFAULT 50,p_query text DEFAULT '')
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM (
 SELECT p.id,p.username,p.display_name,p.avatar_path,
 EXISTS(SELECT 1 FROM public.follows mine WHERE mine.follower_id=public.looply_legacy_uid() AND mine.following_id=p.id) AS "isFollowing"
 FROM public.follows f JOIN public.profiles p ON p.id=CASE WHEN p_kind='followers' THEN f.follower_id ELSE f.following_id END
 WHERE p_kind IN ('followers','following') AND public.looply_legacy_uid() IS NOT NULL
 AND CASE WHEN p_kind='followers' THEN f.following_id=p_profile_id ELSE f.follower_id=p_profile_id END
 AND (COALESCE(p_query,'')='' OR p.display_name ILIKE '%'||p_query||'%' OR p.username ILIKE '%'||p_query||'%')
 ORDER BY f.created_at DESC,p.id LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0)
 ) t
$$;

CREATE OR REPLACE FUNCTION public.v11_profile_content(p_profile_id uuid,p_tab text,p_offset integer DEFAULT 0,p_limit integer DEFAULT 30)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC,t.id),'[]'::jsonb) FROM (
 SELECT post.id,'post'::text AS source,post.author_id AS owner_id,post.body AS caption,post.created_at,
 (SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'storage_path',m.storage_path,'mime_type',m.mime_type,'bucket','looply-media')
 ORDER BY CASE WHEN p_tab='videos' AND m.kind='video' THEN 0 ELSE 1 END,m.created_at,m.id)
 FROM public.post_media m WHERE m.post_id=post.id) AS media
 FROM public.posts post WHERE EXISTS(SELECT 1 FROM public.post_media m WHERE m.post_id=post.id)
 AND ((p_tab='fotos' AND post.author_id=p_profile_id AND EXISTS(SELECT 1 FROM public.post_media m WHERE m.post_id=post.id AND m.kind='image'))
 OR (p_tab='videos' AND post.author_id=p_profile_id AND EXISTS(SELECT 1 FROM public.post_media m WHERE m.post_id=post.id AND m.kind='video'))
 OR (p_tab='mencoes' AND post.author_id<>p_profile_id AND EXISTS(SELECT 1 FROM public.post_mentions pm WHERE pm.post_id=post.id AND pm.person_id=p_profile_id)))
 UNION ALL
 SELECT g.id,'community',g.owner_id,g.caption,g.created_at,
 jsonb_build_array(jsonb_build_object('id',g.id,'kind',g.kind,'storage_path',g.storage_path,'mime_type',g.mime_type,'bucket','looply-gallery'))
 FROM public.community_gallery_media g WHERE g.publication_state='published'
 AND ((p_tab='fotos' AND g.owner_id=p_profile_id AND g.kind='image') OR (p_tab='videos' AND g.owner_id=p_profile_id AND g.kind='video')
 OR (p_tab='mencoes' AND g.owner_id<>p_profile_id AND EXISTS(SELECT 1 FROM public.gallery_media_people tags WHERE tags.source='community' AND tags.media_id=g.id AND tags.person_id=p_profile_id)))
 ORDER BY created_at DESC,id LIMIT LEAST(GREATEST(p_limit,1),60) OFFSET GREATEST(p_offset,0)
 ) t WHERE public.looply_legacy_uid() IS NOT NULL
$$;

-- Caption and tag mutations validate ownership in the database, even for forged clients.
CREATE OR REPLACE FUNCTION public.v11_edit_profile_content(p_source text,p_id uuid,p_action text,p_caption text DEFAULT NULL)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=public.looply_legacy_uid();
BEGIN
 IF actor IS NULL OR p_source IS NULL OR p_action IS NULL OR p_source NOT IN ('post','community') OR p_action NOT IN ('caption','clear_mentions') THEN
 RAISE EXCEPTION 'Invalid content request' USING ERRCODE='42501'; END IF;
 IF p_source='post' THEN
 PERFORM 1 FROM public.posts WHERE id=p_id AND author_id=actor FOR UPDATE;
 ELSE PERFORM 1 FROM public.community_gallery_media WHERE id=p_id AND owner_id=actor AND publication_state='published' FOR UPDATE; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Content not owned' USING ERRCODE='42501'; END IF;
 IF p_action='caption' AND (p_caption IS NULL OR length(p_caption)>CASE WHEN p_source='community' THEN 500 ELSE 2200 END) THEN
 RAISE EXCEPTION 'Invalid caption' USING ERRCODE='22023'; END IF;
 IF p_source='post' THEN
 IF p_action='caption' THEN UPDATE public.posts SET body=p_caption,updated_at=now() WHERE id=p_id;
 ELSE UPDATE public.posts SET body=pg_catalog.regexp_replace(body,'(^|[^A-Za-z0-9_])@[A-Za-z0-9_]{1,30}','\1','g'),updated_at=now() WHERE id=p_id;
 DELETE FROM public.post_mentions WHERE post_id=p_id; END IF;
 ELSE
 IF p_action='caption' THEN UPDATE public.community_gallery_media SET caption=p_caption WHERE id=p_id;
 ELSE DELETE FROM public.gallery_media_people WHERE source='community' AND media_id=p_id; END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.v11_profile_overview(uuid),public.v11_set_follow(uuid,boolean),public.v11_profile_connections(uuid,text,integer,integer,text),public.v11_profile_content(uuid,text,integer,integer),public.v11_edit_profile_content(text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v11_profile_overview(uuid),public.v11_set_follow(uuid,boolean),public.v11_profile_connections(uuid,text,integer,integer,text),public.v11_profile_content(uuid,text,integer,integer),public.v11_edit_profile_content(text,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
