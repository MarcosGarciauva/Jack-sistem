-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Mini-lote de normalización: CLIENTES + CITAS como fuente principal (#2/#6)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. Ejecutar DESPUÉS de normalized_schema.sql.
-- No borra datos, no hace DROP de tablas. Solo:
--   1) Garantiza la columna `deleted_at` en business_clients y business_appointments
--      (el frontend ya filtra `deleted_at is null`; esto asegura que exista en BDs
--      viejas).
--   2) Agrega índices parciales para acelerar la carga normalizada (filtro por
--      negocio + no borrados).
--
-- Esto NO migra empleados, servicios, catálogo, proveedores ni corte de caja.
-- Esos siguen viviendo en app_state por ahora.
-- ════════════════════════════════════════════════════════════════════════════

alter table business_clients      add column if not exists deleted_at timestamptz;
alter table business_appointments add column if not exists deleted_at timestamptz;

-- Carga normalizada: clientes vivos de un negocio, recientes primero.
create index if not exists business_clients_live_idx
  on business_clients (business_id, created_at desc)
  where deleted_at is null;

-- Carga normalizada: citas vivas de un negocio por fecha/hora.
create index if not exists business_appointments_live_idx
  on business_appointments (business_id, date, time)
  where deleted_at is null;
