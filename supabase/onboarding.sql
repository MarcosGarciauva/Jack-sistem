-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Fase B: Onboarding inicial del negocio (P2)
-- ════════════════════════════════════════════════════════════════════════════
-- Agrega el estado de onboarding al negocio. El administrador completa la
-- pantalla en su primer ingreso; al terminar se marca `onboarding_completed`
-- y la encuesta `how_found`. La escritura la hace la Edge Function
-- `admin-manage-user` (acción `complete_onboarding`) con service_role, porque
-- también actualiza `profiles.full_name` (protegido por RLS sin self-update).
--
-- Idempotente: se puede ejecutar varias veces sin error.
-- ════════════════════════════════════════════════════════════════════════════

alter table businesses
  add column if not exists onboarding_completed boolean not null default false;

alter table businesses
  add column if not exists how_found text;

-- Negocios creados antes de esta función no deben quedar bloqueados en el
-- onboarding si ya estaban operando: márcalos como completados manualmente si
-- corresponde. (Comentado por defecto — descomenta si aplica a tu instancia.)
-- update businesses set onboarding_completed = true where created_at < now();

-- Nota: el tipo de negocio (`business_type`) y la copia espejo en
-- `app_state.config` ya existen; la Edge Function los actualiza al completar.
-- No se requiere cambio de RLS: la política `businesses_update_admin` ya permite
-- al administrador del negocio; el nombre del administrador se actualiza con
-- service_role desde la Edge Function.
