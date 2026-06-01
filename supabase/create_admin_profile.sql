-- Jack first admin setup
-- 1. In Supabase Dashboard, go to Authentication > Users and create your user.
-- 2. Copy that Auth user UUID.
-- 3. Replace the values below and run this in SQL Editor.

do $$
declare
  v_auth_user_id uuid := 'REPLACE_WITH_YOUR_AUTH_USER_UUID';
  v_email text := 'REPLACE_WITH_YOUR_EMAIL';
  v_full_name text := 'Marcos Garcia';
  v_business_id uuid;
begin
  insert into businesses (
    name,
    business_type,
    slug,
    currency,
    active,
    app_state
  )
  values (
    'Jack',
    'Sistema de gestion empresarial',
    'jack',
    'MXN',
    true,
    jsonb_build_object(
      'config', jsonb_build_object(
        'businessName', 'Jack',
        'businessType', 'Sistema de gestion empresarial',
        'logoUrl', '/assets/jack-logo.png',
        'currency', 'MXN',
        'publicSlug', 'jack',
        'websiteHeadline', 'Sistema de gestion para negocios de servicios',
        'websiteDescription', 'Administra citas, clientes, empleados, cobros y reservas desde un panel profesional.',
        'address', '',
        'phone', '',
        'whatsapp', '',
        'instagram', '',
        'businessHours', jsonb_build_array(
          jsonb_build_object('day', 1, 'enabled', true, 'open', '09:00', 'close', '18:00'),
          jsonb_build_object('day', 2, 'enabled', true, 'open', '09:00', 'close', '18:00'),
          jsonb_build_object('day', 3, 'enabled', true, 'open', '09:00', 'close', '18:00'),
          jsonb_build_object('day', 4, 'enabled', true, 'open', '09:00', 'close', '18:00'),
          jsonb_build_object('day', 5, 'enabled', true, 'open', '09:00', 'close', '18:00'),
          jsonb_build_object('day', 6, 'enabled', false, 'open', '10:00', 'close', '14:00'),
          jsonb_build_object('day', 0, 'enabled', false, 'open', '10:00', 'close', '14:00')
        ),
        'services', jsonb_build_array(
          jsonb_build_object('id', 'srv-base', 'name', 'Servicio base', 'basePrice', 500, 'duration', 60, 'depositRequired', false, 'depositAmount', 0)
        )
      ),
      'clients', jsonb_build_array(),
      'employees', jsonb_build_array(),
      'appointments', jsonb_build_array()
    )
  )
  on conflict (slug) do update set
    name = excluded.name,
    business_type = excluded.business_type,
    currency = excluded.currency,
    active = true,
    app_state = excluded.app_state,
    updated_at = now()
  returning id into v_business_id;

  insert into profiles (id, email, full_name, role, business_id, active)
  values (v_auth_user_id, v_email, v_full_name, 'admin', v_business_id, true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    business_id = excluded.business_id,
    active = true;
end $$;
