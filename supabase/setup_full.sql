-- ════════════════════════════════════════════════════════════════════════════
-- Jack — setup_full.sql  ·  Instalación consolidada (idempotente)
-- ════════════════════════════════════════════════════════════════════════════
-- GENERADO AUTOMÁTICAMENTE concatenando los scripts del directorio supabase/ en
-- el orden correcto. Ejecútalo de corrido en el SQL Editor de Supabase. Es
-- idempotente: seguro tanto en una instancia NUEVA como en una EXISTENTE
-- (usa "if not exists", "drop ... if exists", "add column if not exists").
--
-- Orden incluido:
--   1. schema.sql ............... base: businesses, profiles, RLS principal
--   2. wave3 .................... public_site_enabled, get_public_business, etc.
--   3. normalized_schema.sql .... tablas normalizadas + auditoría
--   4. onboarding.sql ........... OBLIGATORIO (columna onboarding_completed)
--   5. accounts_direct.sql ...... empleados directos (email, índice profile_id)
--   6. remove_invitations.sql ... elimina el sistema viejo de invitaciones
--   7. catalog_products.sql ..... capa futura (productos y servicios)
--   8. cash_cuts.sql ............ capa futura (corte de caja)
--   9. suppliers.sql ............ capa futura (proveedores)
--  10. normalize_clients_appointments.sql .. clientes/citas normalizados
--  11. normalize_catalog.sql ..... backfill productos/categorias
--  12. normalize_suppliers.sql ... proveedores normalizados + backfill
--  13. normalize_cash_cuts.sql ... corte de caja normalizado + backfill
--  14. remove_mercado_pago.sql .. limpieza de artefactos legacy
--
-- NO INCLUIDO (pasos manuales aparte):
--   • create_admin_profile.sql  → requiere pegar el UUID del usuario Auth.
--   • fix_profile_access.sql    → solo si el login no carga el perfil.
--   • Despliegue de Edge Functions:
--       supabase functions deploy admin-manage-user
--       supabase functions deploy public-booking --no-verify-jwt
--       supabase functions deploy health --no-verify-jwt
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 1/14 · schema.sql                                                      ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- Jack production schema
-- Run this file in Supabase SQL Editor before using the app.
-- Auth users are created in Supabase Authentication; this schema only stores
-- Jack profiles and business state.

create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  active boolean not null default true,
  app_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table businesses add column if not exists name text;
alter table businesses add column if not exists slug text;
alter table businesses add column if not exists business_type text;
alter table businesses add column if not exists currency text;
alter table businesses add column if not exists active boolean not null default true;
alter table businesses add column if not exists app_state jsonb;
alter table businesses add column if not exists created_at timestamptz not null default now();
alter table businesses add column if not exists updated_at timestamptz not null default now();

update businesses
set
  name = coalesce(name, 'Negocio sin nombre'),
  slug = coalesce(slug, 'negocio-' || left(id::text, 8)),
  business_type = coalesce(business_type, 'Servicio'),
  currency = coalesce(currency, 'MXN'),
  app_state = coalesce(app_state, jsonb_build_object(
    'config', jsonb_build_object(
      'businessName', coalesce(name, 'Negocio sin nombre'),
      'businessType', 'Servicio',
      'logoUrl', '',
      'currency', 'MXN',
      'publicSlug', coalesce(slug, 'negocio-' || left(id::text, 8)),
      'websiteHeadline', 'Reserva tu cita en linea',
      'websiteDescription', '',
      'address', '',
      'phone', '',
      'whatsapp', '',
      'instagram', '',
      'businessHours', jsonb_build_array(),
      'services', jsonb_build_array()
    ),
    'clients', jsonb_build_array(),
    'employees', jsonb_build_array(),
    'appointments', jsonb_build_array()
  ));

alter table businesses alter column name set not null;
alter table businesses alter column slug set not null;
alter table businesses alter column business_type set not null;
alter table businesses alter column currency set not null;
alter table businesses alter column app_state set not null;

create unique index if not exists businesses_slug_key on businesses(slug);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('super_admin', 'admin', 'employee')),
  business_id uuid references businesses(id) on delete set null,
  employee_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists email text;
alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists role text not null default 'employee';
alter table profiles add column if not exists business_id uuid references businesses(id) on delete set null;
alter table profiles add column if not exists employee_id text;
alter table profiles add column if not exists active boolean not null default true;
alter table profiles add column if not exists created_at timestamptz not null default now();

alter table businesses enable row level security;
alter table profiles enable row level security;

drop policy if exists "profiles_read_own" on profiles;
create policy "profiles_read_own"
on profiles for select
to authenticated
using (id = auth.uid());

-- Do not add self-referencing admin policies on profiles here. A policy that
-- queries profiles from inside a profiles policy can trigger infinite recursion.
-- Admin user management should be done from a secure backend/Edge Function.
drop policy if exists "profiles_super_admin_all" on profiles;

drop policy if exists "businesses_read_assigned" on businesses;
create policy "businesses_read_assigned"
on businesses for select
to authenticated
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.active = true
      and (p.business_id = businesses.id or p.role = 'super_admin')
  )
);

drop policy if exists "businesses_update_admin" on businesses;
create policy "businesses_update_admin"
on businesses for update
to authenticated
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.business_id = businesses.id
      and p.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.business_id = businesses.id
      and p.role in ('admin', 'super_admin')
  )
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 2/14 · wave3_invitations_public_site.sql                               ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Wave 3
-- Códigos de invitación (acceso restringido) + flag de sitio público por negocio
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql.
-- Es idempotente: se puede correr varias veces sin romper nada.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Códigos de invitación ───────────────────────────────────────────────
-- Solo el super admin (Marcos) genera estos códigos.
-- Cada código es single-use: cuando alguien lo canjea queda used_at = now().
-- El código define qué rol y a qué negocio se va a crear al nuevo usuario.

create table if not exists invitation_codes (
  code text primary key,                 -- código alfanumérico legible: "JACK-XYZ-1234"
  role text not null check (role in ('super_admin', 'admin', 'employee')),
  business_id uuid references businesses(id) on delete cascade,
  employee_id text,                       -- solo para role='employee', match con app_state.employees[].id
  email_hint text,                        -- opcional: para mostrar "esperando que <email> use este código"
  notes text,                             -- nota interna del super admin ("Centro Bienestar MTY")
  expires_at timestamptz,                 -- null = no expira
  used_at timestamptz,                    -- null = vigente
  used_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists invitation_codes_active_idx
  on invitation_codes (created_at desc)
  where used_at is null;

alter table invitation_codes enable row level security;

-- Super admins pueden gestionar todos los códigos.
-- Admins pueden gestionar códigos de empleados de su propio negocio.
drop policy if exists "invitations_super_admin_all" on invitation_codes;
create policy "invitations_super_admin_all"
on invitation_codes
for all
to authenticated
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and invitation_codes.role = 'employee'
          and p.business_id = invitation_codes.business_id
        )
      )
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and invitation_codes.role = 'employee'
          and p.business_id = invitation_codes.business_id
        )
      )
  )
);

-- Permiso especial: cualquier usuario autenticado puede LEER un código por su valor
-- exacto cuando se está canjeando (necesario para el flujo de signup)
drop policy if exists "invitations_lookup_during_signup" on invitation_codes;
create policy "invitations_lookup_during_signup"
on invitation_codes
for select
to authenticated
using (auth.uid() is not null and used_at is null);

-- ─── 2. Sitio público — flag por negocio (paquete add-on) ───────────────────
alter table businesses add column if not exists public_site_enabled boolean not null default false;

-- ─── 3. Permitir lectura PÚBLICA de negocios con sitio público activo ──────
-- Solo del slug, nombre, config visible — necesario para el landing /p/:slug
drop policy if exists "businesses_public_site_read" on businesses;
create policy "businesses_public_site_read"
on businesses
for select
to anon
using (active = true and public_site_enabled = true);

-- ─── 4. Helper RPC: canjear código de invitación ───────────────────────────
-- Se llama desde el cliente después de que Supabase Auth crea el usuario.
-- Marca el código como usado y crea el perfil del usuario en una sola transacción.

create or replace function redeem_invitation_code(
  p_code text,
  p_full_name text
)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite invitation_codes%rowtype;
  v_user_id uuid := auth.uid();
  v_user_email text;
begin
  if v_user_id is null then
    return json_build_object('error', 'No autenticado');
  end if;

  -- Verificar que el código existe y está vigente
  select * into v_invite
  from invitation_codes
  where code = p_code and used_at is null;

  if not found then
    return json_build_object('error', 'Código inválido o ya usado');
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return json_build_object('error', 'Código expirado');
  end if;

  -- Obtener email del usuario autenticado
  select email into v_user_email from auth.users where id = v_user_id;

  -- Seguridad: si el usuario ya tiene perfil en Jack, no permitimos que un
  -- código de invitación reemplace su rol/nombre/negocio por accidente.
  if exists (select 1 from profiles where id = v_user_id) then
    return json_build_object('error', 'Esta cuenta ya tiene perfil. Cierra sesión y crea una cuenta nueva para usar la invitación.');
  end if;

  -- Crear perfil
  insert into profiles (id, email, full_name, role, business_id, employee_id, active)
  values (
    v_user_id,
    v_user_email,
    coalesce(p_full_name, v_user_email),
    v_invite.role,
    v_invite.business_id,
    v_invite.employee_id,
    true
  )
  on conflict (id) do nothing;

  -- Marcar código como usado
  update invitation_codes
  set used_at = now(), used_by = v_user_id
  where code = p_code;

  return json_build_object(
    'success', true,
    'role', v_invite.role,
    'business_id', v_invite.business_id
  );
end;
$$;

grant execute on function redeem_invitation_code(text, text) to authenticated;

-- ─── 5. Helper RPC: validar código antes de crear cuenta (público) ──────────
-- Para mostrar al usuario "Este código es válido para Negocio X" antes de
-- pedirle que cree contraseña.

create or replace function check_invitation_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invitation_codes%rowtype;
  v_business_name text;
begin
  select * into v_invite from invitation_codes where code = p_code;

  if not found then
    return json_build_object('valid', false, 'reason', 'no_existe');
  end if;
  if v_invite.used_at is not null then
    return json_build_object('valid', false, 'reason', 'ya_usado');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return json_build_object('valid', false, 'reason', 'expirado');
  end if;

  select name into v_business_name from businesses where id = v_invite.business_id;

  return json_build_object(
    'valid', true,
    'role', v_invite.role,
    'business_name', coalesce(v_business_name, 'Sistema Jack')
  );
end;
$$;

grant execute on function check_invitation_code(text) to anon;
grant execute on function check_invitation_code(text) to authenticated;

-- ─── 6. Helper RPC: negocio público sanitizado ─────────────────────────────
-- Evita exponer app_state completo al visitante. La página pública solo
-- necesita configuración visible, empleados activos y bloques ocupados.

create or replace function get_public_business(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_employees jsonb;
  v_appointments jsonb;
begin
  select * into v_business
  from businesses
  where slug = p_slug
    and active = true
    and public_site_enabled = true;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', employee->>'id',
    'name', employee->>'name',
    'position', employee->>'position',
    'status', coalesce(employee->>'status', 'active')
  )), '[]'::jsonb)
  into v_employees
  from jsonb_array_elements(coalesce(v_business.app_state->'employees', '[]'::jsonb)) employee
  where coalesce(employee->>'status', 'active') <> 'inactive';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', appointment->>'id',
    'date', appointment->>'date',
    'time', appointment->>'time',
    'duration', coalesce((appointment->>'duration')::int, 60),
    'employeeId', appointment->>'employeeId',
    'status', coalesce(appointment->>'status', 'pending')
  )), '[]'::jsonb)
  into v_appointments
  from jsonb_array_elements(coalesce(v_business.app_state->'appointments', '[]'::jsonb)) appointment
  where coalesce(appointment->>'status', 'pending') <> 'cancelled'
    and appointment->>'date' >= to_char(current_date - interval '1 day', 'YYYY-MM-DD');

  return jsonb_build_object(
    'id', v_business.id,
    'name', v_business.name,
    'slug', v_business.slug,
    'config', v_business.app_state->'config',
    'employees', v_employees,
    'appointments', v_appointments
  );
end;
$$;

grant execute on function get_public_business(text) to anon;
grant execute on function get_public_business(text) to authenticated;

-- Después de crear el RPC sanitizado, el visitante ya no necesita SELECT
-- directo a businesses. Si ya tenías esta política, elimínala para no exponer
-- app_state completo en la red.
drop policy if exists "businesses_public_site_read" on businesses;

-- ════════════════════════════════════════════════════════════════════════════
-- LISTO. Después de correr esto:
-- 1. El super admin puede generar códigos desde el panel.
-- 2. Los nuevos usuarios entran a /signup?code=XYZ, crean cuenta y se canjea.
-- 3. Para activar sitio público de un negocio:
--    UPDATE businesses SET public_site_enabled = true WHERE slug = 'mi-negocio';
-- ════════════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3/14 · normalized_schema.sql                                           ║
-- ╚══════════════════════════════════════════════════════════════════════╝
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
    case
      when exists (
        select 1 from business_clients c
        where c.id = appointment->>'clientId' and c.business_id = p_business_id
      ) then appointment->>'clientId'
      else null
    end,
    case
      when exists (
        select 1 from business_employees e
        where e.id = appointment->>'employeeId' and e.business_id = p_business_id
      ) then appointment->>'employeeId'
      else null
    end,
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

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 4/14 · onboarding.sql  (OBLIGATORIO)                                   ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Fase B: Onboarding inicial del negocio (P2)
-- ════════════════════════════════════════════════════════════════════════════
-- Agrega el estado de onboarding al negocio. El administrador completa la
-- pantalla en su primer ingreso; al terminar se marca `onboarding_completed`
-- y la encuesta `how_found`. La escritura la hace la Edge Function
-- `admin-manage-user` (acción `complete_onboarding`) con service_role, porque
-- también actualiza `profiles.full_name` (protegido por RLS sin self-update).
--
-- Idempotente: se puede ejecutar varias veces sin error.
-- ════════════════════════════════════════════════════════════════════════════

alter table businesses
  add column if not exists onboarding_completed boolean not null default false;

alter table businesses
  add column if not exists how_found text;

-- Negocios creados antes de esta función no deben quedar bloqueados en el
-- onboarding si ya estaban operando: márcalos como completados manualmente si
-- corresponde. (Comentado por defecto — descomenta si aplica a tu instancia.)
-- update businesses set onboarding_completed = true where created_at < now();

-- Nota: el tipo de negocio (`business_type`) y la copia espejo en
-- `app_state.config` ya existen; la Edge Function los actualiza al completar.
-- No se requiere cambio de RLS: la política `businesses_update_admin` ya permite
-- al administrador del negocio; el nombre del administrador se actualiza con
-- service_role desde la Edge Function.

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 5/14 · accounts_direct.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Prioridad 7 (+ cierre del hueco de Prioridad 1): creación directa de
-- cuentas. Acompaña al Edge Function `admin-manage-user`.
-- ════════════════════════════════════════════════════════════════════════════
-- Ejecutar DESPUÉS de normalized_schema.sql. Es idempotente.
--
-- El Edge Function usa el service_role para crear usuarios en auth.users, por lo
-- que no se necesitan políticas RLS nuevas para insertar perfiles. Aquí solo
-- agregamos columnas/índices de apoyo para listar accesos sin consultar auth.
-- ════════════════════════════════════════════════════════════════════════════

-- Correo del empleado (denormalizado: permite listar accesos sin tocar auth.users)
alter table business_employees add column if not exists email text;

-- Resolver empleados por su perfil de acceso
create index if not exists business_employees_profile_idx
  on business_employees(profile_id);

-- ════════════════════════════════════════════════════════════════════════════
-- Recordatorio de despliegue del Edge Function (requiere service_role):
--   supabase functions deploy admin-manage-user
-- El secreto SUPABASE_SERVICE_ROLE_KEY ya está disponible para las functions.
-- ════════════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 6/14 · remove_invitations.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Prioridad 1: Eliminar por completo el sistema de invitaciones por código
-- ════════════════════════════════════════════════════════════════════════════
-- Ejecutar en Supabase SQL Editor. Es idempotente.
--
-- A partir de ahora las cuentas NO se crean con códigos temporales. Se crean
-- directamente con el Edge Function `admin-manage-user`:
--   * super_admin  → crea negocios + administradores.
--   * admin        → crea empleados con correo + contraseña.
--
-- Este script elimina tabla, RPCs y políticas del flujo anterior. Al borrar la
-- tabla con CASCADE también se eliminan sus políticas RLS asociadas.
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists redeem_invitation_code(text, text);
drop function if exists check_invitation_code(text);

drop table if exists invitation_codes cascade;

-- LISTO. No deben quedar referencias a invitation_codes, check_invitation_code
-- ni redeem_invitation_code en la base de datos.

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 7/14 · catalog_products.sql  (capa futura)                             ║
-- ╚══════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 8/14 · cash_cuts.sql  (capa futura)                                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝
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

-- Índice de consulta por día. La unicidad de "un corte activo por día" se aplica en
-- normalize_cash_cuts.sql con un índice parcial (deleted_at is null), para no romper
-- instalaciones existentes con duplicados históricos.
create index if not exists business_cash_cuts_business_date_lookup_idx
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

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 9/14 · suppliers.sql  (capa futura)                                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 10/14 · normalize_clients_appointments.sql                            ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Mini-lote de normalización: CLIENTES + CITAS como fuente principal (#2/#6)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. Ejecutar DESPUÉS de normalized_schema.sql.
-- No borra datos, no hace DROP de tablas. Solo:
--   1) Garantiza la columna `deleted_at` en business_clients y business_appointments
--      (el frontend ya filtra `deleted_at is null`; esto asegura que exista en BDs
--      viejas).
--   2) Agrega índices parciales para acelerar la carga normalizada (filtro por
--      negocio + no borrados).
--
-- Esto NO migra empleados, servicios, catálogo, proveedores ni corte de caja.
-- Esos siguen viviendo en app_state por ahora.
-- ════════════════════════════════════════════════════════════════════════════

alter table business_clients      add column if not exists deleted_at timestamptz;
alter table business_appointments add column if not exists deleted_at timestamptz;

create index if not exists business_clients_live_idx
  on business_clients (business_id, created_at desc)
  where deleted_at is null;

create index if not exists business_appointments_live_idx
  on business_appointments (business_id, date, time)
  where deleted_at is null;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 11/14 · normalize_catalog.sql                                       ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Normalización lote C: PRODUCTOS + CATEGORÍAS de catálogo (#2/#6)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. PRERREQUISITO: haber corrido `catalog_products.sql`
-- (crea business_product_categories y business_products + RLS). Este archivo solo
-- agrega un RPC de BACKFILL para llevar el catálogo que hoy vive en
-- businesses.app_state.config (categories / products) a las tablas normalizadas.
--
-- NO migra proveedores ni corte de caja (lotes D/E). No borra datos, sin DROP.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function migrate_catalog_to_normalized(p_business_id uuid)
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

  insert into business_product_categories (id, business_id, name)
  select
    category->>'id',
    p_business_id,
    category->>'name'
  from jsonb_array_elements(coalesce(v_state->'config'->'categories', '[]'::jsonb)) category
  where coalesce(category->>'id', '') <> ''
  on conflict (id) do update set
    name = excluded.name,
    updated_at = now();

  insert into business_products (id, business_id, category_id, name, cost, cost_type, sale_price)
  select
    product->>'id',
    p_business_id,
    nullif(product->>'categoryId', ''),
    product->>'name',
    coalesce((product->>'cost')::numeric, 0),
    case when product->>'costType' = 'gross' then 'gross' else 'net' end,
    coalesce((product->>'salePrice')::numeric, 0)
  from jsonb_array_elements(coalesce(v_state->'config'->'products', '[]'::jsonb)) product
  where coalesce(product->>'id', '') <> ''
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    cost = excluded.cost,
    cost_type = excluded.cost_type,
    sale_price = excluded.sale_price,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function migrate_catalog_to_normalized(uuid) to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 12/14 · normalize_suppliers.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════════════════════
-- Jack — Normalización lote D: PROVEEDORES (#2/#6)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotente y NO destructivo. PRERREQUISITO: haber corrido `suppliers.sql`
-- (crea business_suppliers + RLS por negocio). Este archivo:
--   1) Agrega `deleted_at` a business_suppliers (soft-delete) + índice parcial.
--   2) Agrega RPC de BACKFILL para llevar los proveedores que hoy viven en
--      businesses.app_state.suppliers (NIVEL RAÍZ, fuera de config para no
--      exponerlos al sitio público) a la tabla normalizada.
--
-- Los proveedores siguen a nivel raíz en AppState y la tabla tiene RLS por negocio:
-- nunca se exponen vía get_public_business. NO migra corte de caja (lote E).
-- ════════════════════════════════════════════════════════════════════════════

alter table business_suppliers add column if not exists deleted_at timestamptz;

create index if not exists business_suppliers_live_idx
  on business_suppliers (business_id, created_at desc)
  where deleted_at is null;

create or replace function migrate_suppliers_to_normalized(p_business_id uuid)
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

  insert into business_suppliers (id, business_id, name, contact_name, phone, email, category, notes)
  select
    supplier->>'id',
    p_business_id,
    supplier->>'name',
    nullif(supplier->>'contactName', ''),
    nullif(supplier->>'phone', ''),
    nullif(supplier->>'email', ''),
    nullif(supplier->>'category', ''),
    nullif(supplier->>'notes', '')
  from jsonb_array_elements(coalesce(v_state->'suppliers', '[]'::jsonb)) supplier
  where coalesce(supplier->>'id', '') <> ''
  on conflict (id) do update set
    name = excluded.name,
    contact_name = excluded.contact_name,
    phone = excluded.phone,
    email = excluded.email,
    category = excluded.category,
    notes = excluded.notes,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function migrate_suppliers_to_normalized(uuid) to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 13/14 · normalize_cash_cuts.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 14/14 · remove_mercado_pago.sql  (limpieza)                         ║
-- ╚══════════════════════════════════════════════════════════════════════╝
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

-- ════════════════════════════════════════════════════════════════════════════
-- FIN setup_full.sql
-- ════════════════════════════════════════════════════════════════════════════
