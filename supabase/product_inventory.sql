-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Inventario de productos (Lote A: existencias)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. PRERREQUISITO: catalog_products.sql (crea
-- business_products). Agrega las columnas de inventario que usa el catálogo:
--   stock      = existencias actuales (entero, default 0)
--   low_stock  = umbral opcional para avisar "stock bajo"
--
-- El front ya espeja estos campos al guardar un producto; este script solo asegura
-- que las columnas existan en la tabla normalizada.
-- ════════════════════════════════════════════════════════════════════════════

alter table business_products add column if not exists stock     numeric not null default 0;
alter table business_products add column if not exists low_stock numeric;
