-- Jack profile access repair
-- Run this if login works but Jack says it cannot load your profile.

alter table profiles enable row level security;
alter table businesses enable row level security;

drop policy if exists "profiles_super_admin_all" on profiles;
drop policy if exists "profiles_read_own" on profiles;
create policy "profiles_read_own"
on profiles for select
to authenticated
using (id = auth.uid());

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

select id, email, full_name, role, business_id, active
from profiles
where id = '996236d6-14ee-4c21-b1c3-d225ce787c26';
