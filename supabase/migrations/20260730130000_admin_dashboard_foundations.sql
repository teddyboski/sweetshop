-- Milestone 8, Task 1: admin dashboard foundations.
--
-- Adds the one new atomic RPC this milestone actually needs
-- (adjust_inventory - manual admin stock changes have no guard against
-- going negative today), a revenue-by-stream view for the Operations
-- Dashboard, and the Storage bucket for real product image uploads
-- (Task 4). No new rewards RPC: public.credit_rewards_points already
-- exists (Milestone 6, 20260720140000_checkout_rewards_credit.sql) and is
-- reused directly for admin manual rewards adjustments (Task 9) - see the
-- Milestone 8 plan's Ground Truth correction.

-- =========================================================================
-- adjust_inventory: the manual-adjustment counterpart to
-- reserve_inventory_for_cart/release_inventory_for_cart (Milestone 6).
-- Those two are guarded against overselling at checkout; this one is the
-- missing guard for an admin's direct restock/correction, which today has
-- no floor check at all.
-- =========================================================================

create or replace function public.adjust_inventory(
  p_snack_id uuid,
  p_delta integer,
  p_reason text,
  p_reference_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.inventory
  set quantity_on_hand = quantity_on_hand + p_delta,
      updated_at = now()
  where snack_id = p_snack_id
    and quantity_on_hand + p_delta >= 0;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Adjustment would make quantity_on_hand negative for snack %', p_snack_id
      using errcode = 'P0001';
  end if;

  insert into public.inventory_events (snack_id, delta, reason, reference_id)
  values (p_snack_id, p_delta, p_reason, p_reference_id);
end;
$$;
comment on function public.adjust_inventory(uuid, integer, text, uuid) is
  'Atomic manual inventory adjustment (admin restock/correction) with a floor guard against negative quantity_on_hand, which reserve_inventory_for_cart/release_inventory_for_cart do not need (checkout already guards via WHERE quantity_on_hand >= needed) but a direct admin adjustment does. See Milestone 8 plan, Task 1/Task 5.';

-- =========================================================================
-- revenue_by_stream_daily: classifies each paid order's line items by
-- revenue stream (subscription box / one-time box / a-la-carte snack, per
-- CLAUDE.md's three revenue streams) and rolls up by day. Only accurate
-- for the subscription stream once Task 1B's invoice.paid handler exists
-- alongside this - before that, renewal months are invisible to `orders`
-- entirely (see Milestone 8 plan Ground Truth / Product Decision #7).
-- =========================================================================

create view public.revenue_by_stream_daily
with (security_invoker = true) as
select
  date_trunc('day', o.created_at)::date as revenue_date,
  case
    when oi.item_type = 'box' and b.is_subscription then 'subscription'
    when oi.item_type = 'box' and not b.is_subscription then 'one_time_box'
    else 'a_la_carte_snack'
  end as revenue_stream,
  sum(oi.unit_price_cents * oi.quantity) as revenue_cents
from public.order_items oi
join public.orders o on o.id = oi.order_id
left join public.boxes b on b.id = oi.box_id
where o.status = 'paid' and o.deleted_at is null
group by revenue_date, revenue_stream;
comment on view public.revenue_by_stream_daily is
  'security_invoker = true, matching customer_lifetime_value''s own precedent - only admins can read orders beyond their own rows anyway. See Milestone 8 plan Task 1/Task 2.';

-- =========================================================================
-- product-images Storage bucket (Task 4): public read (product photos are
-- meant to be publicly visible on the storefront), writes gated to admins
-- only via the same is_admin() helper every other admin-only policy in
-- this schema uses.
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product-images public read"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "product-images admin write"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product-images admin update"
  on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());

create policy "product-images admin delete"
  on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());
