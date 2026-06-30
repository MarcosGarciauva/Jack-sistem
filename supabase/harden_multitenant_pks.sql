-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Endurecimiento multi-tenant de llaves (#5)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. NO dropea ni recrea PKs/FKs.
--
-- Contexto: las tablas normalizadas usan `id text primary key` GLOBAL. Los ids se
-- generan con uid() (aleatorio) y los negocios nuevos arrancan vacíos, así que una
-- colisión de id entre dos negocios es prácticamente imposible. El ÚNICO riesgo es
-- el caso freak: un upsert `on conflict (id) do update set business_id = ...` que
-- reasignara una fila existente a OTRO negocio (fuga/corrupción multi-tenant).
--
-- Este archivo agrega un TRIGGER GUARDIÁN que bloquea cualquier UPDATE que intente
-- cambiar `business_id`. Una fila SIEMPRE pertenece al mismo negocio; si un upsert
-- cruzado intentara reasignarla, falla con error en vez de corromper silenciosamente.
--
-- La migración "correcta" a PK compuesta (business_id, id) o UUID queda DOCUMENTADA
-- como paso futuro opcional: es destructiva (drop/recreate de PK + FKs + ajustes de
-- RLS, onConflict del front y edge functions) y debe hacerse CON RESPALDO. Con uid()
-- aleatorio + este guardián, el riesgo práctico ya queda neutralizado.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function jack_block_business_id_change()
returns trigger
language plpgsql
as $$
begin
  if NEW.business_id is distinct from OLD.business_id then
    raise exception
      'business_id inmutable: intento de reasignar % de % a % (posible colisión de id entre negocios)',
      TG_TABLE_NAME, OLD.business_id, NEW.business_id;
  end if;
  return NEW;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'business_services',
    'business_employees',
    'business_clients',
    'business_appointments',
    'business_product_categories',
    'business_products',
    'business_suppliers',
    'business_cash_cuts'
  ];
begin
  foreach t in array tables loop
    -- Solo si la tabla existe (algunas son opcionales según lo que se haya corrido).
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists jack_guard_business_id on %I', t);
      execute format(
        'create trigger jack_guard_business_id before update on %I
           for each row execute function jack_block_business_id_change()',
        t
      );
    end if;
  end loop;
end;
$$;
