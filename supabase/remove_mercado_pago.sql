-- Jack — Remove old Mercado Pago artifacts
-- Run once if the project had the previous Mercado Pago/payment-table setup.

do $$
begin
  if to_regclass('public.payments') is not null then
    execute 'drop policy if exists "payments_insert_public" on payments';
    execute 'drop policy if exists "payments_read_assigned" on payments';
    execute 'drop table if exists payments';
  end if;
end $$;

update businesses
set app_state = app_state #- '{config,paymentProvider}' #- '{config,mercadoPagoEnabled}'
where app_state ? 'config';
