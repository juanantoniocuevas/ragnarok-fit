-- Paso 1 de 2: agrega el rol "owner" (dueño / cuenta maestra).
-- Va en un archivo aparte porque Postgres no permite usar un valor nuevo
-- de un tipo enum en la misma transacción en que se crea.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
