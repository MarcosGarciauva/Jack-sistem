-- Jack — Normalized data layer
-- Run after schema.sql and wave3_invitations_public_site.sql.
-- This keeps businesses.app_state as compatibility storage while adding
-- queryable tables for production growth.

create table if not exists business_services (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  base_price numeric not null default 0,
  duration_minutes int not null default 60,
  deposit_required boolean not null default false,
  deposit_amount numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_employees (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  name text not null,
  position text not null default 'Especialista',
  status text not null check (status in ('active', 'inactive')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_clients (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists business_appointments (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  client_id text references business_clients(id) on delete set null,
  employee_id text references business_employees(id) on delete set null,
  service_id text references business_services(id) on delete set null,
  service_name text not null,
  date date not null,
  time time not null,
  duration_minutes int not null default 60,
  price numeric not null default 0,
  status text not null check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')) default 'pending',
  payment_status text not null check (payment_status in ('none', 'paid')) default 'none',
  paid_amount numeric not null default 0,
  source text not null check (source in ('dashboard', 'public_site')) default 'dashboard',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists business_services_business_idx on business_services(business_id);
create index if not exists business_employees_business_idx on business_employees(business_id);
create index if not exists business_clients_business_idx on business_clients(business_id);
create index if not exists business_appointments_business_date_idx on business_appointments(business_id, date, time);
create index if not exists business_appointments_employee_date_idx on business_appointments(employee_id, date, time);
create index if not exists business_appointments_public_pending_idx
  on business_appointments(business_id, created_at desc)
  where source = 'public_site' and status = 'pending';

create table if not exists appointment_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  appointment_id text not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists appointment_audit_business_idx
  on appointment_audit_events(business_id, appointment_id, created_at desc);

alter table business_services enable row level security;
alter table business_employees enable row level security;
alter table business_clients enable row level security;
alter table business_appointments enable row level security;

alter table business_appointments add column if not exists reminder_sent_at timestamptz;
alter table appointment_audit_events enable row level security;

drop policy if exists "business_services_same_business" on business_services;
create policy "business_services_same_business" on business_services
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_services.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_services.business_id)
));

drop policy if exists "business_employees_same_business" on business_employees;
create policy "business_employees_same_business" on business_employees
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_employees.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_employees.business_id)
));

drop policy if exists "business_clients_same_business" on business_clients;
create policy "business_clients_same_business" on business_clients
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_clients.business_id)
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = business_clients.business_id)
));

drop policy if exists "business_appointments_same_business" on business_appointments;
create policy "business_appointments_same_business" on business_appointments
for all to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (
      p.role = 'super_admin'
      or p.business_id = business_appointments.business_id
      or (p.role = 'employee' and p.employee_id = business_appointments.employee_id)
    )
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (
      p.role = 'super_admin'
      or p.business_id = business_appointments.business_id
      or (p.role = 'employee' and p.employee_id = business_appointments.employee_id)
    )
));

drop policy if exists "appointment_audit_same_business" on appointment_audit_events;
create policy "appointment_audit_same_business" on appointment_audit_events
for select to authenticated
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.active = true
    and (p.role = 'super_admin' or p.business_id = appointment_audit_events.business_id)
));

create or replace function record_appointment_audit(
  p_business_id uuid,
  p_appointment_id text,
  p_action text,
  p_old_value text,
  p_new_value text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into appointment_audit_events (
    business_id,
    appointment_id,
    actor_id,
    action,
    old_value,
    new_value
  )
  values (
    p_business_id,
    p_appointment_id,
    auth.uid(),
    p_action,
    p_old_value,
    p_new_value
  );
end;
$$;

grant execute on function record_appointment_audit(uuid, text, text, text, text) to authenticated;

create or replace function migrate_app_state_to_normalized(p_business_id uuid)
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

  insert into business_services (id, business_id, name, base_price, duration_minutes, deposit_required, deposit_amount)
  select
    service->>'id',
    p_business_id,
    service->>'name',
    coalesce((service->>'basePrice')::numeric, 0),
    coalesce((service->>'duration')::int, 60),
    coalesce((service->>'depositRequired')::boolean, false),
    coalesce((service->>'depositAmount')::numeric, 0)
  from jsonb_array_elements(coalesce(v_state->'config'->'services', '[]'::jsonb)) service
  on conflict (id) do update set
    name = excluded.name,
    base_price = excluded.base_price,
    duration_minutes = excluded.duration_minutes,
    deposit_required = excluded.deposit_required,
    deposit_amount = excluded.deposit_amount,
    updated_at = now();

  insert into business_employees (id, business_id, name, position, status)
  select
    employee->>'id',
    p_business_id,
    employee->>'name',
    coalesce(employee->>'position', 'Especialista'),
    coalesce(employee->>'status', 'active')
  from jsonb_array_elements(coalesce(v_state->'employees', '[]'::jsonb)) employee
  on conflict (id) do update set
    name = excluded.name,
    position = excluded.position,
    status = excluded.status,
    updated_at = now();

  insert into business_clients (id, business_id, name, phone, email, notes)
  select
    client->>'id',
    p_business_id,
    client->>'name',
    coalesce(client->>'phone', ''),
    nullif(client->>'email', ''),
    nullif(client->>'notes', '')
  from jsonb_array_elements(coalesce(v_state->'clients', '[]'::jsonb)) client
  on conflict (id) do update set
    name = excluded.name,
    phone = excluded.phone,
    email = excluded.email,
    notes = excluded.notes,
    updated_at = now();

  insert into business_appointments (
    id, business_id, client_id, employee_id, service_name, date, time,
    duration_minutes, price, status, payment_status, paid_amount, source, notes, created_at
  )
  select
    appointment->>'id',
    p_business_id,
    appointment->>'clientId',
    appointment->>'employeeId',
    appointment->>'service',
    (appointment->>'date')::date,
    (appointment->>'time')::time,
    coalesce((appointment->>'duration')::int, 60),
    coalesce((appointment->>'price')::numeric, 0),
    coalesce(appointment->>'status', 'pending'),
    case when appointment->>'paymentStatus' = 'paid' then 'paid' else 'none' end,
    coalesce((appointment->>'paidAmount')::numeric, 0),
    coalesce(appointment->>'source', 'dashboard'),
    nullif(appointment->>'notes', ''),
    coalesce((appointment->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_state->'appointments', '[]'::jsonb)) appointment
  on conflict (id) do update set
    client_id = excluded.client_id,
    employee_id = excluded.employee_id,
    service_name = excluded.service_name,
    date = excluded.date,
    time = excluded.time,
    duration_minutes = excluded.duration_minutes,
    price = excluded.price,
    status = excluded.status,
    payment_status = excluded.payment_status,
    paid_amount = excluded.paid_amount,
    source = excluded.source,
    notes = excluded.notes,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function migrate_app_state_to_normalized(uuid) to authenticated;
