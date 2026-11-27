-- Convierte una cuenta existente en dueño (cuenta maestra).
-- Solo es necesario si la migración no pudo elegir al dueño
-- automáticamente (por ejemplo, porque había varios preparadores).
-- Uso: Lovable → Cloud → Database → SQL editor. Cambia el correo y ejecuta.
INSERT INTO public.user_roles (user_id, role)
SELECT id, r.role
FROM auth.users, (VALUES ('trainer'::public.app_role), ('owner'::public.app_role)) AS r(role)
WHERE lower(email) = lower('correo-del-dueno@ejemplo.cl')
ON CONFLICT (user_id, role) DO NOTHING;
