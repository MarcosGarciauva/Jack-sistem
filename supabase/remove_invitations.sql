-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Prioridad 1: Eliminar por completo el sistema de invitaciones por código
-- ════════════════════════════════════════════════════════════════════════════
-- Ejecutar en Supabase SQL Editor. Es idempotente.
--
-- A partir de ahora las cuentas NO se crean con códigos temporales. Se crean
-- directamente con el Edge Function `admin-manage-user`:
--   * super_admin  → crea negocios + administradores.
--   * admin        → crea empleados con correo + contraseña.
--
-- Este script elimina tabla, RPCs y políticas del flujo anterior. Al borrar la
-- tabla con CASCADE también se eliminan sus políticas RLS asociadas.
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists redeem_invitation_code(text, text);
drop function if exists check_invitation_code(text);

drop table if exists invitation_codes cascade;

-- LISTO. No deben quedar referencias a invitation_codes, check_invitation_code
-- ni redeem_invitation_code en la base de datos.
