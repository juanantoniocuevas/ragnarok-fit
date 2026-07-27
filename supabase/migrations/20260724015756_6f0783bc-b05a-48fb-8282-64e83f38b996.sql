
-- Helper: check target is a client and not a trainer
CREATE OR REPLACE FUNCTION public.is_manageable_client(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'client'::app_role)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'trainer'::app_role)
$$;

REVOKE ALL ON FUNCTION public.is_manageable_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manageable_client(uuid) TO authenticated, service_role;

-- profiles: restrict trainer SELECT/UPDATE to client rows only
DROP POLICY IF EXISTS profiles_trainer_select_all ON public.profiles;
DROP POLICY IF EXISTS profiles_trainer_update_all ON public.profiles;

CREATE POLICY profiles_trainer_select_clients ON public.profiles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(id));

CREATE POLICY profiles_trainer_update_clients ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(id))
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(id));

-- physical_profiles
DROP POLICY IF EXISTS pp_trainer_select_all ON public.physical_profiles;
DROP POLICY IF EXISTS pp_trainer_update_all ON public.physical_profiles;

CREATE POLICY pp_trainer_select_clients ON public.physical_profiles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(user_id));

CREATE POLICY pp_trainer_update_clients ON public.physical_profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(user_id))
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(user_id));

-- measurements
DROP POLICY IF EXISTS m_trainer_select_all ON public.measurements;
CREATE POLICY m_trainer_select_clients ON public.measurements
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(user_id));

-- recommendations
DROP POLICY IF EXISTS r_trainer_select_all ON public.recommendations;
DROP POLICY IF EXISTS r_trainer_insert_all ON public.recommendations;
DROP POLICY IF EXISTS r_trainer_update_all ON public.recommendations;
DROP POLICY IF EXISTS r_trainer_delete_all ON public.recommendations;

CREATE POLICY r_trainer_select_clients ON public.recommendations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND public.is_manageable_client(client_id));

CREATE POLICY r_trainer_insert_clients ON public.recommendations
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) AND admin_id = auth.uid() AND public.is_manageable_client(client_id));

CREATE POLICY r_trainer_update_clients ON public.recommendations
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND admin_id = auth.uid() AND public.is_manageable_client(client_id))
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) AND admin_id = auth.uid() AND public.is_manageable_client(client_id));

CREATE POLICY r_trainer_delete_clients ON public.recommendations
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND admin_id = auth.uid() AND public.is_manageable_client(client_id));

-- user_roles: restrict trainer SELECT to client rows only
DROP POLICY IF EXISTS user_roles_trainer_select_all ON public.user_roles;
CREATE POLICY user_roles_trainer_select_clients ON public.user_roles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) AND role = 'client'::app_role);

-- Defense-in-depth trigger: block any INSERT/UPDATE of user_roles to 'trainer' outside service_role
CREATE OR REPLACE FUNCTION public.prevent_trainer_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'trainer'::app_role AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    -- Also allow when session is superuser/service (no JWT claim)
    IF (auth.uid() IS NOT NULL) THEN
      RAISE EXCEPTION 'Trainer role can only be granted server-side';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_prevent_trainer_escalation ON public.user_roles;
CREATE TRIGGER user_roles_prevent_trainer_escalation
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_trainer_role_escalation();
