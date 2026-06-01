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
