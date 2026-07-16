-- Exempts the service_role database role from the profile
-- privilege-escalation trigger. The trigger's purpose is to stop an
-- authenticated *customer* from elevating their own role/rewards/etc.
-- via a direct table update; it was never meant to block trusted
-- server-side code (Route Handlers, seed scripts, webhooks) that
-- legitimately performs these mutations using the service-role key.
-- Route Handlers using the service-role key are expected to perform
-- their own caller-authorization checks (e.g. is_admin()) before
-- reaching this table -- see /api/admin/users/[id]/role.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role cannot be changed by the account owner';
  end if;

  if new.rewards_points is distinct from old.rewards_points then
    raise exception 'rewards_points cannot be changed by the account owner';
  end if;

  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'stripe_customer_id cannot be changed by the account owner';
  end if;

  if new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code cannot be changed by the account owner';
  end if;

  return new;
end;
$$;