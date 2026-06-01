-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Fase D: Corte de caja (P5)
-- ════════════════════════════════════════════════════════════════════════════
-- Capa normalizada para el historial de cortes de caja. Hoy la app persiste los
-- cortes en businesses.app_state.cashCuts (nivel raíz, fuera de config para no
-- exponer datos financieros al sitio público); esta tabla es la dirección
-- normalizada futura y mantiene el mismo patrón de RLS por negocio que el resto
-- de tablas normalizadas.
--
-- Idempotente: usa "if not exists" y "drop policy if exists".
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists business_cash_cuts (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  cut_date date not null,
  closed_at timestamptz not null default now(),
  closed_by text,
  opening_float numeric not null default 0,
  total numeric not null default 0,
  paid_count integer not null default 0,
  pending_balance numeric not null default 0,
  movements integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un corte por día por negocio (cerrar de nuevo el mismo día actualiza la foto).
create unique index if not exists business_cash_cuts_business_date_idx
  on business_cash_cuts(business_id, cut_date);

create index if not exists business_cash_cuts_business_idx
  on business_cash_cuts(business_id);

-- ── RLS por negocio (mismo patrón que el resto de tablas normalizadas) ─────────
alter table business_cash_cuts enable row level security;

drop policy if exists "business_cash_cuts_same_business" on business_cash_cuts;
create policy "business_cash_cuts_same_business" on business_cash_cuts
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_cash_cuts.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_cash_cuts.business_id)
));
