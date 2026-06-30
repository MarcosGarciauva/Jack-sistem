-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Ventas de productos (tabla normalizada)
-- ════════════════════════════════════════════════════════════════════════════
-- Las ventas del módulo Ventas (POS ligero dentro de Agenda) dejan de vivir solo
-- en app_state: cada venta se INSERTA por fila aquí. Esto:
--   (a) permite que el rol `employee` registre ventas (su RLS no le deja escribir
--       el JSON completo de businesses, que era el bug anterior),
--   (b) evita el race del JSON monolítico,
--   (c) alimenta corte de caja y estadísticas con fuente confiable.
-- El stock se decrementa en business_products (la política same_business ya
-- permite update a cualquier miembro activo del negocio).
--
-- Idempotente. Correr DESPUÉS de schema.sql (necesita businesses y profiles).
-- El frontend es tolerante: si la tabla no existe aún, la venta queda en app_state.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists business_sales (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  sale_date date not null,
  sale_time text not null default '',
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card_credit', 'card_debit', 'transfer')),
  employee_id text,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists business_sales_business_idx on business_sales(business_id);
create index if not exists business_sales_date_idx on business_sales(business_id, sale_date);

alter table business_sales enable row level security;

-- Misma política que catálogo/proveedores: cualquier perfil ACTIVO del negocio
-- (admin o empleado) puede leer y registrar ventas de SU negocio.
drop policy if exists "business_sales_same_business" on business_sales;
create policy "business_sales_same_business" on business_sales
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_sales.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_sales.business_id)
));

-- Guardián multi-tenant (#5): si harden_multitenant_pks.sql ya se corrió, proteger
-- también esta tabla contra UPDATEs que cambien business_id.
do $$
begin
  if to_regproc('public.jack_block_business_id_change') is not null then
    execute 'drop trigger if exists jack_guard_business_sales on business_sales';
    execute 'create trigger jack_guard_business_sales before update on business_sales
             for each row execute function jack_block_business_id_change()';
  end if;
end $$;
