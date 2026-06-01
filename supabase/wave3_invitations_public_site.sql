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
