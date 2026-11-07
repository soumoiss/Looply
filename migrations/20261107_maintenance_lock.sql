-- Canonical maintenance gate for the production Neon database.
-- Run once against the production branch; this migration is idempotent.
-- No application data is removed and maintenance remains unchanged.
CREATE OR REPLACE FUNCTION public.looply_maintenance_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  enabled boolean;
  exempt boolean := false;
  legacy_id uuid;
BEGIN
  SELECT s.maintenance_mode INTO enabled FROM public.app_settings AS s WHERE s.id = 1;
  IF enabled IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('enabled', true, 'exempt', false, 'blocked', true);
  END IF;
  IF enabled AND auth.uid() IS NOT NULL AND public.v3_self_is_admin() THEN
    legacy_id := public.looply_legacy_uid();
    SELECT EXISTS(
      SELECT 1 FROM public.profiles p
      WHERE p.id = legacy_id AND pg_catalog.lower(p.username) = 'peixinho'
    ) INTO exempt;
  END IF;
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
