-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Normalización lote D: PROVEEDORES (#2/#6)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. PRERREQUISITO: haber corrido `suppliers.sql`
-- (crea business_suppliers + RLS por negocio). Este archivo:
--   1) Agrega `deleted_at` a business_suppliers (soft-delete) + índice parcial.
--   2) Agrega RPC de BACKFILL para llevar los proveedores que hoy viven en
--      businesses.app_state.suppliers (NIVEL RAÍZ, fuera de config para no
--      exponerlos al sitio público) a la tabla normalizada.
--
-- Los proveedores siguen a nivel raíz en AppState y la tabla tiene RLS por negocio:
-- nunca se exponen vía get_public_business. NO migra corte de caja (lote E).
-- ════════════════════════════════════════════════════════════════════════════

alter table business_suppliers add column if not exists deleted_at timestamptz;

create index if not exists business_suppliers_live_idx
  on business_suppliers (business_id, created_at desc)
  where deleted_at is null;

create or replace function migrate_suppliers_to_normalized(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
begin
  select app_state into v_state from businesses where id = p_business_id;
  if v_state is null then
    return jsonb_build_object('error', 'Negocio no encontrado');
  end if;

  insert into business_suppliers (id, business_id, name, contact_name, phone, email, category, notes)
  select
    supplier->>'id',
    p_business_id,
    supplier->>'name',
    nullif(supplier->>'contactName', ''),
    nullif(supplier->>'phone', ''),
    nullif(supplier->>'email', ''),
    nullif(supplier->>'category', ''),
    nullif(supplier->>'notes', '')
  from jsonb_array_elements(coalesce(v_state->'suppliers', '[]'::jsonb)) supplier
  where coalesce(supplier->>'id', '') <> ''
  on conflict (id) do update set
    name = excluded.name,
    contact_name = excluded.contact_name,
    phone = excluded.phone,
    email = excluded.email,
    category = excluded.category,
    notes = excluded.notes,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function migrate_suppliers_to_normalized(uuid) to authenticated;
