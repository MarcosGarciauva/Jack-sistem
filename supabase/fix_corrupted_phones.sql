-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Limpieza de teléfonos corruptos por el bug viejo de PhoneInput
-- ════════════════════════════════════════════════════════════════════════════
-- El bug (ya corregido en src/components/PhoneInput.tsx) hacía "bola de nieve":
-- al teclear, el código de país (52/1) se reinyectaba y el valor crecía
-- "5252525252…". Los datos nuevos ya entran bien; esto limpia los viejos en
-- business_clients (fuente de verdad). NO es destructivo de filas; solo corrige
-- la columna phone. CORRE LOS SELECT PRIMERO y revisa antes del UPDATE.
--
-- Heurística: el bug PREPENDÍA "52" (al frente) y los dígitos tecleados quedaban al
-- final. Por eso los ÚLTIMOS 10 dígitos suelen ser el número real → se reconstruye
-- como 52 + últimos 10. Aplica a números MX corruptos (largo de dígitos > 13). Los
-- de EE.UU. o ambiguos se dejan para revisión manual.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. DETECTAR (solo lectura). Válidos: 10, 11 (1+10), 12 (52+10), 13 (521+10).
--     Sospechosos: > 13 dígitos o patrón "52" repetido 3+ veces.
select
  id,
  business_id,
  name,
  phone                                   as phone_actual,
  length(regexp_replace(phone, '\D', '', 'g')) as digitos,
  '52' || right(regexp_replace(phone, '\D', '', 'g'), 10) as phone_propuesto
from business_clients
where deleted_at is null
  and (
    length(regexp_replace(phone, '\D', '', 'g')) > 13
    or regexp_replace(phone, '\D', '', 'g') ~ '^(52){3,}'
  )
order by digitos desc;

-- ── 2. (Opcional) Conteo por negocio.
-- select business_id, count(*) as corruptos
-- from business_clients
-- where deleted_at is null
--   and length(regexp_replace(phone, '\D', '', 'g')) > 13
-- group by business_id;

-- ── 3. CORREGIR (heurística MX). Revisa el SELECT #1 antes de correr esto.
--     Toma los últimos 10 dígitos y reconstruye 52 + esos 10.
-- update business_clients
-- set phone = '52' || right(regexp_replace(phone, '\D', '', 'g'), 10),
--     updated_at = now()
-- where deleted_at is null
--   and length(regexp_replace(phone, '\D', '', 'g')) > 13;

-- ── 4. NOTA sobre app_state:
--     El JSON businesses.app_state también puede tener los teléfonos viejos en
--     clients[].phone. Como la LECTURA de clientes ya viene de business_clients,
--     el app_state desfasado no afecta la pantalla. Se "sana" solo la próxima vez
--     que se guarde el cliente desde la app (mirror/upsert). Si quieres forzarlo,
--     reasigna el teléfono del cliente desde la ficha y guarda.
