-- Milestone 6, Task 3: atomic rewards credit.
--
-- Milestone 1's schema header (note 2) is explicit: "rewards_points must
-- never be written outside of the same transaction as the corresponding
-- rewards_ledger insert." A naive application-code "read profiles.rewards_
-- points, add delta, write it back" is a classic lost-update race if two
-- orders for the same user are ever processed close together - the same
-- class of bug the inventory reservation functions (Task 1) were built to
-- avoid. This does both writes in one atomic statement pair instead.

create or replace function public.credit_rewards_points(
  p_user_id uuid,
  p_delta_points integer,
  p_reason text,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rewards_ledger (user_id, delta_points, reason, order_id)
  values (p_user_id, p_delta_points, p_reason, p_order_id);

  update public.profiles
  set rewards_points = rewards_points + p_delta_points,
      updated_at = now()
  where id = p_user_id;
end;
$$;
comment on function public.credit_rewards_points(uuid, integer, text, uuid) is
  'Atomically writes a rewards_ledger entry and updates profiles.rewards_points in the same transaction, per Milestone 1 schema note 2. Called from the Stripe webhook on checkout.session.completed for authenticated orders only - see Milestone 6 plan, Product Decisions #7 and #9 (1 point per dollar spent).';
