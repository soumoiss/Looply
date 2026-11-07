-- Canonical maintenance gate for the production Neon database.
-- Run once against the production branch; this migration is idempotent.
-- No application data is removed and maintenance remains unchanged.
-- Resolve the *authenticated* Neon identity through its verified link to
-- Peixinho's profile. A forged display name or username cannot bypass RLS.
CREATE OR REPLACE FUNCTION public.looply_maintenance_admin_bypass()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM neon_auth."user" AS account
    INNER JOIN looply_migration.verified_identity_links AS link
      ON link.neon_user_id = account.id
    INNER JOIN public.profiles AS profile
      ON profile.id = link.legacy_user_id
    WHERE account.id = auth.uid()
      AND account.role = 'admin'
      AND COALESCE(account.banned, false) = false
      AND pg_catalog.lower(profile.username) = 'peixinho'
  );
$function$;

CREATE OR REPLACE FUNCTION public.looply_maintenance_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  enabled boolean;
  exempt boolean;
BEGIN
  SELECT s.maintenance_mode INTO enabled FROM public.app_settings AS s WHERE s.id = 1;
  IF enabled IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('enabled', true, 'exempt', false, 'blocked', true);
  END IF;
  exempt := public.looply_maintenance_admin_bypass();
  RETURN pg_catalog.jsonb_build_object(
    'enabled', enabled,
    'exempt', exempt,
    'blocked', enabled AND NOT exempt
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.looply_maintenance_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE((public.looply_maintenance_status()->>'blocked')::boolean, false) = false;
$function$;

GRANT EXECUTE ON FUNCTION public.looply_maintenance_admin_bypass() TO authenticated;
GRANT EXECUTE ON FUNCTION public.looply_maintenance_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.looply_maintenance_allowed() TO authenticated;

-- A restrictive policy is AND-ed with every existing RLS policy. This
-- blocks direct Data API reads/writes by non-ADM accounts without changing
-- the original per-feature authorization policies while maintenance is off.
-- app_settings stays readable so clients can detect and exit maintenance.
DO $maintenance$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relrowsecurity
      AND c.relname <> 'app_settings'
  LOOP
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS looply_maintenance_gate ON public.%I', target.table_name);
    EXECUTE pg_catalog.format(
      'CREATE POLICY looply_maintenance_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.looply_maintenance_allowed()) WITH CHECK (public.looply_maintenance_allowed())',
      target.table_name
    );
  END LOOP;
END
$maintenance$;

-- Views run with the requesting user's RLS permissions, not their owner's
-- privileges; this avoids bypassing the maintenance policy via Data API views.
ALTER VIEW public.v3_feed_posts SET (security_invoker = true);
ALTER VIEW public.v3_self_profile SET (security_invoker = true);
