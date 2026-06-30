-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Corte de caja v2: método de pago por cita + esperado por método
-- ════════════════════════════════════════════════════════════════════════════
-- 1) `business_appointments.payment_method`: con qué pagó el cliente. Se registra
--    al marcar la cita como "Pagada" (cash | card_credit | card_debit | transfer).
--    El corte de caja lo usa para calcular el ESPERADO POR MÉTODO. Citas viejas
--    quedan en null ("sin método registrado").
-- 2) `business_cash_cuts.expected_*` + `sales_*`: foto del esperado por método al
--    cierre (citas pagadas con método + ventas de productos del día) para que el
--    detalle del historial sobreviva a recargas (los cortes se leen de esta tabla).
--
-- Idempotente. Correr DESPUÉS de normalized_schema.sql y cash_cuts.sql.
-- El frontend es tolerante: si estas columnas no existen aún, reintenta sin ellas.
-- ════════════════════════════════════════════════════════════════════════════

alter table if exists public.business_appointments
  add column if not exists payment_method text
  check (payment_method is null or payment_method in ('cash', 'card_credit', 'card_debit', 'transfer'));

alter table if exists public.business_cash_cuts
  add column if not exists expected_cash numeric,
  add column if not exists expected_card_credit numeric,
  add column if not exists expected_card_debit numeric,
  add column if not exists expected_transfer numeric,
  add column if not exists expected_unassigned numeric,
  add column if not exists sales_total numeric,
  add column if not exists sales_count integer;
