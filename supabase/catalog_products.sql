-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Fase C: Productos y Servicios + categorías (P4)
-- ════════════════════════════════════════════════════════════════════════════
-- Capa normalizada para el catálogo unificado. Hoy la app persiste el catálogo
-- en businesses.app_state.config (categories / products / services) como capa de
-- compatibilidad; estas tablas son la dirección normalizada futura y mantienen el
-- mismo patrón de RLS por negocio que el resto de tablas normalizadas.
--
-- Idempotente: usa "if not exists" y "drop policy if exists".
-- ════════════════════════════════════════════════════════════════════════════

-- ── Categorías de catálogo ────────────────────────────────────────────────────
create table if not exists business_product_categories (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_product_categories_business_idx
  on business_product_categories(business_id);

-- ── Productos ─────────────────────────────────────────────────────────────────
create table if not exists business_products (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  category_id text references business_product_categories(id) on delete set null,
  name text not null,
  cost numeric not null default 0,
  cost_type text not null default 'net' check (cost_type in ('net', 'gross')),
  sale_price numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_products_business_idx on business_products(business_id);
create index if not exists business_products_category_idx on business_products(category_id);

-- ── Extiende servicios con categoría y costo (no rompe filas existentes) ───────
alter table business_services add column if not exists category_id text
  references business_product_categories(id) on delete set null;
alter table business_services add column if not exists cost numeric not null default 0;
alter table business_services add column if not exists cost_type text not null default 'net'
  check (cost_type in ('net', 'gross'));

-- ── RLS por negocio (mismo patrón que el resto de tablas normalizadas) ─────────
alter table business_product_categories enable row level security;
alter table business_products enable row level security;

drop policy if exists "business_product_categories_same_business" on business_product_categories;
create policy "business_product_categories_same_business" on business_product_categories
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_product_categories.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_product_categories.business_id)
));

drop policy if exists "business_products_same_business" on business_products;
create policy "business_products_same_business" on business_products
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_products.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_products.business_id)
));
