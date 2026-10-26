-- The public app may ask only whether its currently authenticated Neon identity
-- is an administrator. The browser never chooses an account or role identifier.
CREATE OR REPLACE FUNCTION public.v3_self_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM neon_auth."user" AS auth_user
    WHERE auth_user.id = auth.uid()
      AND auth_user.role = 'admin'
      AND COALESCE(auth_user.banned, false) = false
  );
$function$;

REVOKE ALL ON FUNCTION public.v3_self_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v3_self_is_admin() TO authenticated;
