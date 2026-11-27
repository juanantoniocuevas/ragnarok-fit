-- Paso 2 de 2: dueño, preparadores y clientes.
--
--  * Dueño (owner): cuenta maestra. Tiene además el rol "trainer". Ve y
--    gestiona a todos los clientes y preparadores.
--  * Preparador (trainer): ve y gestiona solo a sus clientes asignados.
--  * Cliente (client): solo sus propios datos.
--
-- Las asignaciones (trainer_clients) solo se crean o cambian desde el
-- servidor (service_role); nadie las modifica desde el navegador.

-- ---------------------------------------------------------------
-- Funciones de permisos
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'::app_role)
$$;
REVOKE ALL ON FUNCTION public.is_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated, service_role;

-- ¿Puede _actor gestionar al cliente _client?
-- Sí si _client es cliente (no personal) y _actor es dueño, o es un
-- preparador activo con una asignación aceptada a ese cliente.
CREATE OR REPLACE FUNCTION public.can_manage_client(_actor uuid, _client uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _actor IS NOT NULL
     AND public.is_manageable_client(_client)
     AND (
       public.is_owner(_actor)
       OR (
         public.has_role(_actor, 'trainer'::app_role)
         AND EXISTS (
           SELECT 1 FROM public.trainer_clients tc
           WHERE tc.trainer_id = _actor AND tc.client_id = _client AND tc.accepted_at IS NOT NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.profiles p
           WHERE p.id = _actor AND (p.status = 'disabled' OR p.disabled_at IS NOT NULL)
         )
       )
     )
$$;
REVOKE ALL ON FUNCTION public.can_manage_client(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_client(uuid, uuid) TO authenticated, service_role;

-- Un cliente gestionable no puede tener rol de personal.
CREATE OR REPLACE FUNCTION public.is_manageable_client(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'client'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _target AND role IN ('trainer'::app_role, 'owner'::app_role)
     )
$$;

-- Los roles "trainer" y "owner" solo se asignan desde el servidor.
CREATE OR REPLACE FUNCTION public.prevent_trainer_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('trainer'::app_role, 'owner'::app_role)
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Los roles de personal solo se asignan desde el servidor';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- Políticas: perfiles
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS profiles_trainer_select_clients ON public.profiles;
DROP POLICY IF EXISTS profiles_trainer_update_clients ON public.profiles;
DROP POLICY IF EXISTS profiles_staff_select ON public.profiles;
DROP POLICY IF EXISTS profiles_staff_update ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_select_all ON public.profiles;

CREATE POLICY profiles_staff_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_manage_client(auth.uid(), id));

CREATE POLICY profiles_staff_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.can_manage_client(auth.uid(), id))
  WITH CHECK (public.can_manage_client(auth.uid(), id));

-- El dueño también ve los perfiles de los preparadores.
CREATE POLICY profiles_owner_select_all ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()));

-- ---------------------------------------------------------------
-- Perfil físico
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS pp_trainer_select_clients ON public.physical_profiles;
DROP POLICY IF EXISTS pp_trainer_update_clients ON public.physical_profiles;
DROP POLICY IF EXISTS pp_staff_select ON public.physical_profiles;
DROP POLICY IF EXISTS pp_staff_update ON public.physical_profiles;

CREATE POLICY pp_staff_select ON public.physical_profiles
  FOR SELECT TO authenticated
  USING (public.can_manage_client(auth.uid(), user_id));

CREATE POLICY pp_staff_update ON public.physical_profiles
  FOR UPDATE TO authenticated
  USING (public.can_manage_client(auth.uid(), user_id))
  WITH CHECK (public.can_manage_client(auth.uid(), user_id));

-- ---------------------------------------------------------------
-- Mediciones
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS m_trainer_select_clients ON public.measurements;
DROP POLICY IF EXISTS m_staff_select ON public.measurements;

CREATE POLICY m_staff_select ON public.measurements
  FOR SELECT TO authenticated
  USING (public.can_manage_client(auth.uid(), user_id));

-- ---------------------------------------------------------------
-- Recomendaciones
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS r_trainer_select_clients ON public.recommendations;
DROP POLICY IF EXISTS r_trainer_insert_clients ON public.recommendations;
DROP POLICY IF EXISTS r_trainer_update_clients ON public.recommendations;
DROP POLICY IF EXISTS r_trainer_delete_clients ON public.recommendations;
-- Políticas antiguas basadas en invitaciones
DROP POLICY IF EXISTS rec_admin_insert ON public.recommendations;
DROP POLICY IF EXISTS rec_admin_select ON public.recommendations;
DROP POLICY IF EXISTS rec_admin_update ON public.recommendations;
DROP POLICY IF EXISTS rec_admin_delete ON public.recommendations;
DROP POLICY IF EXISTS r_staff_select ON public.recommendations;
DROP POLICY IF EXISTS r_staff_insert ON public.recommendations;
DROP POLICY IF EXISTS r_staff_update ON public.recommendations;
DROP POLICY IF EXISTS r_staff_delete ON public.recommendations;

CREATE POLICY r_staff_select ON public.recommendations
  FOR SELECT TO authenticated
  USING (public.can_manage_client(auth.uid(), client_id));

CREATE POLICY r_staff_insert ON public.recommendations
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND public.can_manage_client(auth.uid(), client_id));

-- Cada uno edita o borra sus propias recomendaciones; el dueño, cualquiera.
CREATE POLICY r_staff_update ON public.recommendations
  FOR UPDATE TO authenticated
  USING (public.can_manage_client(auth.uid(), client_id) AND (admin_id = auth.uid() OR public.is_owner(auth.uid())))
  WITH CHECK (public.can_manage_client(auth.uid(), client_id) AND (admin_id = auth.uid() OR public.is_owner(auth.uid())));

CREATE POLICY r_staff_delete ON public.recommendations
  FOR DELETE TO authenticated
  USING (public.can_manage_client(auth.uid(), client_id) AND (admin_id = auth.uid() OR public.is_owner(auth.uid())));

-- ---------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS user_roles_trainer_select_clients ON public.user_roles;
DROP POLICY IF EXISTS user_roles_staff_select ON public.user_roles;

CREATE POLICY user_roles_staff_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()) OR public.can_manage_client(auth.uid(), user_id));

-- ---------------------------------------------------------------
-- Asignaciones preparador-cliente: solo lectura desde el navegador
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS tc_trainer_insert ON public.trainer_clients;
DROP POLICY IF EXISTS tc_trainer_delete ON public.trainer_clients;
DROP POLICY IF EXISTS tc_client_accept ON public.trainer_clients;
DROP POLICY IF EXISTS tc_client_delete ON public.trainer_clients;
DROP POLICY IF EXISTS tc_owner_select ON public.trainer_clients;

CREATE POLICY tc_owner_select ON public.trainer_clients
  FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.trainer_clients FROM authenticated;

-- ---------------------------------------------------------------
-- Datos actuales
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid;
  v_trainers int;
BEGIN
  SELECT user_id INTO v_owner FROM public.user_roles WHERE role = 'owner'::app_role LIMIT 1;

  -- Si hay un solo preparador y todavía no hay dueño, ese preparador pasa a ser el dueño.
  IF v_owner IS NULL THEN
    SELECT count(*) INTO v_trainers FROM public.user_roles WHERE role = 'trainer'::app_role;
    IF v_trainers = 1 THEN
      SELECT user_id INTO v_owner FROM public.user_roles WHERE role = 'trainer'::app_role;
      INSERT INTO public.user_roles (user_id, role) VALUES (v_owner, 'owner'::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      RAISE NOTICE 'Hay % preparadores: asigna el dueño con supabase/hacer-dueno.sql', v_trainers;
    END IF;
  END IF;

  -- Los clientes sin preparador quedan a cargo del dueño.
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.trainer_clients (trainer_id, client_id, requested_by, accepted_at)
    SELECT v_owner, ur.user_id, v_owner, now()
    FROM public.user_roles ur
    WHERE ur.role = 'client'::app_role
      AND public.is_manageable_client(ur.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.trainer_clients tc
        WHERE tc.client_id = ur.user_id AND tc.accepted_at IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.trainer_clients tc
        WHERE tc.client_id = ur.user_id AND tc.trainer_id = v_owner
      );
  END IF;
END $$;
