-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Prioridad 7 (+ cierre del hueco de Prioridad 1): creación directa de
-- cuentas. Acompaña al Edge Function `admin-manage-user`.
-- ════════════════════════════════════════════════════════════════════════════
-- Ejecutar DESPUÉS de normalized_schema.sql. Es idempotente.
--
-- El Edge Function usa el service_role para crear usuarios en auth.users, por lo
-- que no se necesitan políticas RLS nuevas para insertar perfiles. Aquí solo
-- agregamos columnas/índices de apoyo para listar accesos sin consultar auth.
-- ════════════════════════════════════════════════════════════════════════════

-- Correo del empleado (denormalizado: permite listar accesos sin tocar auth.users)
alter table business_employees add column if not exists email text;

-- Resolver empleados por su perfil de acceso
create index if not exists business_employees_profile_idx
  on business_employees(profile_id);

-- ════════════════════════════════════════════════════════════════════════════
-- Recordatorio de despliegue del Edge Function (requiere service_role):
--   supabase functions deploy admin-manage-user
-- El secreto SUPABASE_SERVICE_ROLE_KEY ya está disponible para las functions.
-- ════════════════════════════════════════════════════════════════════════════
