-- Looply storage garbage collector - 2026-10-31.
-- No historical recovered/ objects are automatically deleted.
-- All deletes are recorded before the row disappears (including ON DELETE CASCADE).
-- Deploy a Neon Function Trigger to consume this queue; tables are private.
CREATE TABLE IF NOT EXISTS looply_private.storage_gc_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL CHECK(bucket IN ('looply-media','looply-gallery','looply-chat')),
  object_key text NOT NULL CHECK(length(object_key) BETWEEN 12 AND 1024),
  origin text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','protected','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  UNIQUE(bucket,object_key)
);

CREATE INDEX IF NOT EXISTS storage_gc_ready ON looply_private.storage_gc_jobs (next_attempt_at,id) WHERE state IN ('pending','processing');

REVOKE ALL ON looply_private.storage_gc_jobs FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION looply_private.queue_deleted_media()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
 DECLARE bucket_name text;
 BEGIN
  bucket_name := CASE TG_TABLE_NAME
    WHEN 'story_media' THEN 'looply-media'
    WHEN 'post_media' THEN 'looply-media'
    WHEN 'comment_media' THEN 'looply-media'
    WHEN 'chat_media' THEN 'looply-chat'
    WHEN 'community_gallery_media' THEN 'looply-gallery'
    WHEN 'archive_media' THEN 'looply-media'
    ELSE NULL END;
  IF bucket_name IS NULL OR OLD.storage_path IS NULL THEN RETURN OLD; END IF;
  -- Never auto-purge historical recovery, imported archive or paths outside
  -- the generated namespaces. These need intentional separate review.
  IF OLD.storage_path LIKE 'recovered/%'
     OR OLD.storage_path LIKE 'recovery-20261025/%'
     OR OLD.storage_path LIKE 'legacy-archive/%'
     OR OLD.storage_path !~ '^(posts|stories|comments|gallery|conversations)/[a-f0-9-]+/' THEN
    RETURN OLD;
  END IF;
  INSERT INTO looply_private.storage_gc_jobs(bucket,object_key,origin)
  VALUES(bucket_name,OLD.storage_path,TG_TABLE_NAME)
  ON CONFLICT(bucket,object_key) DO UPDATE SET
    state=CASE WHEN looply_private.storage_gc_jobs.state='protected' THEN 'pending'
           ELSE looply_private.storage_gc_jobs.state END,
    next_attempt_at=now()
    WHERE looply_private.storage_gc_jobs.state='protected';
  RETURN OLD;
 END $$;

REVOKE ALL ON FUNCTION looply_private.queue_deleted_media() FROM PUBLIC,anonymous,authenticated;

DROP TRIGGER IF EXISTS looply_gc_story_media ON public.story_media;

CREATE TRIGGER looply_gc_story_media AFTER DELETE ON public.story_media FOR EACH ROW EXECUTE FUNCTION looply_private.queue_deleted_media();

DROP TRIGGER IF EXISTS looply_gc_post_media ON public.post_media;

CREATE TRIGGER looply_gc_post_media AFTER DELETE ON public.post_media FOR EACH ROW EXECUTE FUNCTION looply_private.queue_deleted_media();

DROP TRIGGER IF EXISTS looply_gc_comment_media ON public.comment_media;

CREATE TRIGGER looply_gc_comment_media AFTER DELETE ON public.comment_media FOR EACH ROW EXECUTE FUNCTION looply_private.queue_deleted_media();

DROP TRIGGER IF EXISTS looply_gc_chat_media ON public.chat_media;

CREATE TRIGGER looply_gc_chat_media AFTER DELETE ON public.chat_media FOR EACH ROW EXECUTE FUNCTION looply_private.queue_deleted_media();

DROP TRIGGER IF EXISTS looply_gc_gallery_media ON public.community_gallery_media;

CREATE TRIGGER looply_gc_gallery_media AFTER DELETE ON public.community_gallery_media FOR EACH ROW EXECUTE FUNCTION looply_private.queue_deleted_media();

DROP TRIGGER IF EXISTS looply_gc_archive_media ON public.archive_media;

CREATE TRIGGER looply_gc_archive_media AFTER DELETE ON public.archive_media FOR EACH ROW EXECUTE FUNCTION looply_private.queue_deleted_media();

CREATE OR REPLACE FUNCTION looply_private.gc_expired_stories(max_rows integer DEFAULT 30)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
 DECLARE removed integer;
 BEGIN
  -- Enforce exact expiration, never a blanket deletion of old gallery/posts.
  WITH due AS (
   SELECT id FROM public.stories
   WHERE expires_at <= clock_timestamp()
   ORDER BY expires_at ASC LIMIT LEAST(GREATEST(max_rows,1),30)
   FOR UPDATE SKIP LOCKED
  ), deleted AS (
   DELETE FROM public.stories s USING due WHERE s.id=due.id
   RETURNING s.id
  ) SELECT count(*) INTO removed FROM deleted;
  RETURN removed;
 END $$;

REVOKE ALL ON FUNCTION looply_private.gc_expired_stories(integer) FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION looply_private.gc_claim_jobs(max_rows integer DEFAULT 20)
 RETURNS TABLE(id bigint,bucket text,object_key text,attempts integer)
 LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  WITH selected AS (
   SELECT j.id FROM looply_private.storage_gc_jobs j
   WHERE j.attempts < 12 AND j.next_attempt_at<=now()
     AND (j.state='pending' OR (j.state='processing' AND j.locked_until<now()))
   ORDER BY j.id LIMIT LEAST(GREATEST(max_rows,1),20)
   FOR UPDATE SKIP LOCKED
  ), claims AS (
    UPDATE looply_private.storage_gc_jobs j SET state='processing',
    locked_until=now()+interval '3 minutes',attempts=j.attempts+1
    FROM selected s WHERE s.id=j.id
    RETURNING j.id,j.bucket,j.object_key,j.attempts
  ) SELECT * FROM claims
 $$;

REVOKE ALL ON FUNCTION looply_private.gc_claim_jobs(integer) FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION looply_private.gc_reference_count(p_bucket text,p_path text)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT CASE WHEN p_bucket='looply-media' THEN
 (SELECT count(*) FROM public.post_media WHERE storage_path=p_path)+
 (SELECT count(*) FROM public.story_media WHERE storage_path=p_path)+
 (SELECT count(*) FROM public.comment_media WHERE storage_path=p_path)+
 (SELECT count(*) FROM public.archive_media WHERE storage_path=p_path)
 WHEN p_bucket='looply-gallery' THEN
 (SELECT count(*) FROM public.community_gallery_media WHERE storage_path=p_path)
 WHEN p_bucket='looply-chat' THEN
 (SELECT count(*) FROM public.chat_media WHERE storage_path=p_path)
 ELSE 1 END
 $$;

REVOKE ALL ON FUNCTION looply_private.gc_reference_count(text,text) FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION looply_private.gc_finish_job(p_id bigint,p_state text,p_error text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
 BEGIN
  IF p_state NOT IN ('done','protected','failed','pending') THEN RAISE EXCEPTION 'invalid_state'; END IF;
  UPDATE looply_private.storage_gc_jobs SET
   state=CASE WHEN p_state='pending' AND attempts>=12 THEN 'failed' ELSE p_state END,
   last_error=left(coalesce(p_error,''),160),
   completed_at=CASE WHEN p_state IN ('done','protected') THEN now() ELSE NULL END,
   locked_until=NULL,
   next_attempt_at=now()+make_interval(secs => LEAST(3600,60*power(2,LEAST(attempts,6))::integer))
  WHERE id=p_id AND state='processing';
 END $$;

REVOKE ALL ON FUNCTION looply_private.gc_finish_job(bigint,text,text) FROM PUBLIC,anonymous,authenticated;
