-- Milestone 25: schema for the "scan the sticker, sign up, get 15% off your
-- first order" welcome offer (docs/superpowers/specs/2026-09-20-scan-offer-design.md).
--
-- Schema only. The SCAN15 promotion row is deliberately NOT seeded here: it is
-- created after the app code that understands first_order_only is deployed,
-- because the previously deployed checkout would honour an unrestricted
-- SCAN15 as an ordinary unlimited 15% code.

-- =========================================================================
-- promotions.first_order_only
-- =========================================================================
alter table public.promotions
  add column if not exists first_order_only boolean not null default false;

comment on column public.promotions.first_order_only is
  'When true the promotion is redeemable once per authenticated customer and only while they have no paid, fulfilled or shipped order. Enforced server-side by resolvePromotion (src/lib/promotions).';

-- =========================================================================
-- profiles.signup_offer_code
-- =========================================================================
alter table public.profiles
  add column if not exists signup_offer_code text;

comment on column public.profiles.signup_offer_code is
  'Code of a first_order_only promotion the customer arrived with (?offer= at signup, e.g. from the QR sticker). Written only by handle_new_user(); the welcome offer is auto-applied at checkout from it.';

-- =========================================================================
-- promotion_redemptions: one row per (promotion, customer), written only by
-- the Stripe webhook (service role) after payment is confirmed.
-- =========================================================================
create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (promotion_id, user_id)
);

comment on table public.promotion_redemptions is
  'Records that a customer used a promotion on a paid order. Enforces one use per customer for first_order_only promotions. Service-role writes only (Stripe webhook); customers may read their own rows.';

alter table public.promotion_redemptions enable row level security;

create policy "promotion_redemptions select own"
  on public.promotion_redemptions
  for select
  using (auth.uid() = user_id or public.is_admin());

create index promotion_redemptions_user_id_idx on public.promotion_redemptions(user_id);

-- =========================================================================
-- handle_new_user(): now also captures an offer code from signup metadata
-- =========================================================================
--
-- Identical to the Milestone 9 version (referral capture) plus: the client
-- passes ?offer= as auth.signUp's options.data.offer_code. It is stored on
-- the profile only when it names an existing first_order_only promotion;
-- anything else (unknown, empty, a normal promotion) is a silent no-op, never
-- an error - signup must never fail because of a bad ?offer= value.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral_code text;
  v_referrer_id uuid;
  v_offer_code text;
begin
  v_referral_code := new.raw_user_meta_data->>'referral_code';

  if v_referral_code is not null then
    select id into v_referrer_id
    from public.profiles
    where referral_code = v_referral_code;
  end if;

  select code into v_offer_code
  from public.promotions
  where first_order_only
    and code = upper(btrim(coalesce(new.raw_user_meta_data->>'offer_code', '')));

  if v_referrer_id is not null and v_referrer_id <> new.id then
    insert into public.profiles (id, email, referred_by, signup_offer_code)
    values (new.id, new.email, v_referrer_id, v_offer_code);

    insert into public.referrals (referrer_id, referred_id, status)
    values (v_referrer_id, new.id, 'pending');
  else
    insert into public.profiles (id, email, signup_offer_code)
    values (new.id, new.email, v_offer_code);
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Auto-provisions a profiles row on signup (Milestone 1); captures an optional referral relationship from raw_user_meta_data.referral_code (Milestone 9) and an optional welcome-offer code from raw_user_meta_data.offer_code (Milestone 25). Invalid/missing/self-referencing/unknown codes are a silent no-op, never an error.';

-- =========================================================================
-- prevent_profile_privilege_escalation(): also guard signup_offer_code
-- =========================================================================
-- Same body as the service-role-exemption migration, plus the new column.
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

  if new.signup_offer_code is distinct from old.signup_offer_code then
    raise exception 'signup_offer_code cannot be changed by the account owner';
  end if;

  return new;
end;
$$;
