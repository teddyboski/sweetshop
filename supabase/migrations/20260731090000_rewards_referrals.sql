-- Milestone 9, Task 1: referral capture at signup + guarded RPCs for
-- promo-code usage and rewards-points redemption.
--
-- Ground Truth (Milestone 9 plan doc): handle_new_user() has never read
-- any signup metadata, so profiles.referred_by has been unset since
-- Milestone 1 and public.referrals has zero rows in the live DB. This
-- migration is what actually turns those two on.

-- =========================================================================
-- handle_new_user(): now reads a referral code from signup metadata
-- =========================================================================
--
-- The client (signup page, Task 2) passes the referral code it read from
-- ?ref= as auth.signUp's options.data.referral_code, which Supabase Auth
-- stores on auth.users.raw_user_meta_data. An invalid, missing, or
-- self-referencing code is a silent no-op here, never an error - signup
-- must never fail because of a bad ?ref= value someone typed or an old
-- shared link.
--
-- Setting referred_by here (at INSERT time) does not trip the
-- profiles_prevent_privilege_escalation trigger from the initial schema -
-- that trigger only fires BEFORE UPDATE, not BEFORE INSERT, so this
-- remains the one and only path referred_by is ever set, exactly as
-- intended (the account owner still can never change it afterward via a
-- normal client update).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral_code text;
  v_referrer_id uuid;
begin
  v_referral_code := new.raw_user_meta_data->>'referral_code';

  if v_referral_code is not null then
    select id into v_referrer_id
    from public.profiles
    where referral_code = v_referral_code;
  end if;

  if v_referrer_id is not null and v_referrer_id <> new.id then
    insert into public.profiles (id, email, referred_by)
    values (new.id, new.email, v_referrer_id);

    insert into public.referrals (referrer_id, referred_id, status)
    values (v_referrer_id, new.id, 'pending');
  else
    insert into public.profiles (id, email)
    values (new.id, new.email);
  end if;

  return new;
end;
$$;
comment on function public.handle_new_user() is
  'Auto-provisions a profiles row on signup (Milestone 1) and, from Milestone 9, captures an optional referral relationship from raw_user_meta_data.referral_code -- sets referred_by and inserts a pending referrals row in the same transaction. Invalid/missing/self-referencing codes are a silent no-op, never an error.';

-- =========================================================================
-- increment_promotion_used_count: atomic guarded increment, mirroring
-- increment_drop_units_sold (Milestone 6) exactly. Deferred here from
-- Milestone 1's and Milestone 8's own schema/plan comments.
-- =========================================================================
create or replace function public.increment_promotion_used_count(p_promotion_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.promotions
  set used_count = used_count + 1,
      updated_at = now()
  where id = p_promotion_id
    and (usage_limit is null or used_count < usage_limit)
    and (expires_at is null or expires_at > now());

  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$$;
comment on function public.increment_promotion_used_count(uuid) is
  'Atomic guarded increment for promotions.used_count, deferred here from Milestone 1/8. Returns false (not an exception) when the increment would exceed usage_limit or the promotion has expired.';

-- =========================================================================
-- redeem_rewards_points: atomic guarded debit, single-user-scoped (no
-- reservation/release needed, unlike inventory - see plan doc). Mirrors
-- credit_rewards_points' shape (Milestone 6) but subtracting with a
-- balance guard instead of unconditionally adding.
-- =========================================================================
create or replace function public.redeem_rewards_points(
  p_user_id uuid,
  p_points integer,
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.profiles
  set rewards_points = rewards_points - p_points,
      updated_at = now()
  where id = p_user_id
    and rewards_points >= p_points;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return false;
  end if;

  insert into public.rewards_ledger (user_id, delta_points, reason, order_id)
  values (p_user_id, -p_points, 'redemption', p_order_id);

  return true;
end;
$$;
comment on function public.redeem_rewards_points(uuid, integer, uuid) is
  'Atomic guarded debit for rewards-points redemption at checkout (Milestone 9). Returns false (not an exception) if the balance is insufficient, writing nothing.';
