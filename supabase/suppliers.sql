-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Fase E: Proveedores (P10)
-- ════════════════════════════════════════════════════════════════════════════
-- Capa normalizada para los proveedores del negocio. Hoy la app persiste los
-- proveedores en businesses.app_state.suppliers (nivel raíz, fuera de config
-- para no exponer datos de contacto al sitio público); esta tabla es la
-- dirección normalizada futura y mantiene el mismo patrón de RLS por negocio
-- que el resto de tablas normalizadas.
--
-- Idempotente: usa "if not exists" y "drop policy if exists".
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists business_suppliers (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_suppliers_business_idx
  on business_suppliers(business_id);

-- ── RLS por negocio (mismo patrón que el resto de tablas normalizadas) ─────────
alter table business_suppliers enable row level security;

drop policy if exists "business_suppliers_same_business" on business_suppliers;
create policy "business_suppliers_same_business" on business_suppliers
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_suppliers.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_suppliers.business_id)
));
