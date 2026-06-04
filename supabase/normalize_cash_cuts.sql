-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Normalización lote E: CORTE DE CAJA (#2/#6)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. PRERREQUISITO: haber corrido `cash_cuts.sql`
-- (crea business_cash_cuts + RLS por negocio). Este archivo:
--   1) Extiende business_cash_cuts con las columnas por método de pago / retiro
--      (P7) que la tabla original no guardaba, + `deleted_at` (soft-delete).
--   2) Agrega RPC de BACKFILL desde businesses.app_state.cashCuts (NIVEL RAÍZ,
--      fuera de config para no exponer datos financieros al sitio público).
--
-- Los cortes siguen a nivel raíz en AppState y la tabla tiene RLS por negocio:
-- nunca se exponen vía get_public_business. Cierra la migración #2/#6.
-- ════════════════════════════════════════════════════════════════════════════

alter table business_cash_cuts add column if not exists cash_amount    numeric;
alter table business_cash_cuts add column if not exists card_credit    numeric;
alter table business_cash_cuts add column if not exists card_debit     numeric;
alter table business_cash_cuts add column if not exists transfer       numeric;
alter table business_cash_cuts add column if not exists total_received numeric;
alter table business_cash_cuts add column if not exists expected_total numeric;
alter table business_cash_cuts add column if not exists difference     numeric;
alter table business_cash_cuts add column if not exists withdrawal     numeric;
alter table business_cash_cuts add column if not exists cash_remaining numeric;
alter table business_cash_cuts add column if not exists deleted_at     timestamptz;

create index if not exists business_cash_cuts_live_idx
  on business_cash_cuts (business_id, cut_date desc)
  where deleted_at is null;

-- Si ya existen duplicados activos por negocio/día, conservamos vivo el más reciente
-- y marcamos los anteriores como deleted_at. Esto permite crear el índice único
-- parcial sin destruir filas históricas.
with ranked as (
  select
    id,
    row_number() over (
      partition by business_id, cut_date
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from business_cash_cuts
  where deleted_at is null
)
update business_cash_cuts cut
set deleted_at = now(), updated_at = now()
from ranked
where cut.id = ranked.id and ranked.rn > 1;

-- FIX (lote E): el índice único original `business_cash_cuts_business_date_idx`
-- (de cash_cuts.sql) era INCONDICIONAL sobre (business_id, cut_date). Como el borrado
-- es soft-delete (la fila se queda con deleted_at), esa fila seguía OCUPANDO el día y
-- bloqueaba recrear/subir un corte para una fecha que ya tuvo uno (p. ej. días
-- anteriores ya borrados/históricos). Lo reemplazamos por un índice único PARCIAL:
-- solo puede haber un corte ACTIVO (deleted_at is null) por día; los borrados ya no
-- bloquean. Idempotente.
drop index if exists business_cash_cuts_business_date_idx;
create unique index if not exists business_cash_cuts_business_date_live_idx
  on business_cash_cuts (business_id, cut_date)
  where deleted_at is null;

create or replace function migrate_cash_cuts_to_normalized(p_business_id uuid)
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

  insert into business_cash_cuts (
    id, business_id, cut_date, closed_at, closed_by, opening_float, total,
    paid_count, pending_balance, movements, notes,
    cash_amount, card_credit, card_debit, transfer, total_received,
    expected_total, difference, withdrawal, cash_remaining
  )
  select
    cut->>'id',
    p_business_id,
    (cut->>'date')::date,
    coalesce((cut->>'closedAt')::timestamptz, now()),
    nullif(cut->>'closedBy', ''),
    coalesce((cut->>'openingFloat')::numeric, 0),
    coalesce((cut->>'total')::numeric, 0),
    coalesce((cut->>'paidCount')::int, 0),
    coalesce((cut->>'pendingBalance')::numeric, 0),
    coalesce((cut->>'movements')::int, 0),
    nullif(cut->>'notes', ''),
    (cut->>'cashAmount')::numeric,
    (cut->>'cardCredit')::numeric,
    (cut->>'cardDebit')::numeric,
    (cut->>'transfer')::numeric,
    (cut->>'totalReceived')::numeric,
    (cut->>'expectedTotal')::numeric,
    (cut->>'difference')::numeric,
    (cut->>'withdrawal')::numeric,
    (cut->>'cashRemaining')::numeric
  from jsonb_array_elements(coalesce(v_state->'cashCuts', '[]'::jsonb)) cut
  where coalesce(cut->>'id', '') <> ''
  on conflict (id) do update set
    cut_date = excluded.cut_date,
    closed_at = excluded.closed_at,
    closed_by = excluded.closed_by,
    opening_float = excluded.opening_float,
    total = excluded.total,
    paid_count = excluded.paid_count,
    pending_balance = excluded.pending_balance,
    movements = excluded.movements,
    notes = excluded.notes,
    cash_amount = excluded.cash_amount,
    card_credit = excluded.card_credit,
    card_debit = excluded.card_debit,
    transfer = excluded.transfer,
    total_received = excluded.total_received,
    expected_total = excluded.expected_total,
    difference = excluded.difference,
    withdrawal = excluded.withdrawal,
    cash_remaining = excluded.cash_remaining,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function migrate_cash_cuts_to_normalized(uuid) to authenticated;
