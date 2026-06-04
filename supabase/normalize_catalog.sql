-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Normalización lote C: PRODUCTOS + CATEGORÍAS de catálogo (#2/#6)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. PRERREQUISITO: haber corrido `catalog_products.sql`
-- (crea business_product_categories y business_products + RLS). Este archivo solo
-- agrega un RPC de BACKFILL para llevar el catálogo que hoy vive en
-- businesses.app_state.config (categories / products) a las tablas normalizadas.
--
-- NO migra proveedores ni corte de caja (lotes D/E). No borra datos, sin DROP.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function migrate_catalog_to_normalized(p_business_id uuid)
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

  -- Categorías primero (los productos referencian category_id por FK).
  insert into business_product_categories (id, business_id, name)
  select
    category->>'id',
    p_business_id,
    category->>'name'
  from jsonb_array_elements(coalesce(v_state->'config'->'categories', '[]'::jsonb)) category
  where coalesce(category->>'id', '') <> ''
  on conflict (id) do update set
    name = excluded.name,
    updated_at = now();

  -- Productos. `active` no se toca en conflicto (no resucita uno desactivado).
  insert into business_products (id, business_id, category_id, name, cost, cost_type, sale_price)
  select
    product->>'id',
    p_business_id,
    nullif(product->>'categoryId', ''),
    product->>'name',
    coalesce((product->>'cost')::numeric, 0),
    case when product->>'costType' = 'gross' then 'gross' else 'net' end,
    coalesce((product->>'salePrice')::numeric, 0)
  from jsonb_array_elements(coalesce(v_state->'config'->'products', '[]'::jsonb)) product
  where coalesce(product->>'id', '') <> ''
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    cost = excluded.cost,
    cost_type = excluded.cost_type,
    sale_price = excluded.sale_price,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function migrate_catalog_to_normalized(uuid) to authenticated;
