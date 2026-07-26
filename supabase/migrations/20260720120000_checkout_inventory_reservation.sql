-- Milestone 6, Task 1: atomic inventory reservation for checkout.
--
-- Deferred from Milestone 1 (see that migration's comments on
-- inventory_events and drops.units_sold): concurrent checkout traffic
-- against a naive read-then-write stock check can oversell. This migration
-- adds guarded, atomic Postgres functions so a reservation either fully
-- succeeds (every needed snack has enough stock, all decremented in one
-- transaction) or fully fails (nothing is decremented) - a customer never
-- sees a half-reserved cart.
--
-- Reservation lifecycle (Milestone 6 plan, Product Decision #2):
--   1. reserve_inventory_for_cart() runs at Stripe Checkout session
--      creation, before any payment. Writes 'checkout_hold' inventory_events
--      rows keyed by cart_id.
--   2. If the Stripe session expires unpaid, release_inventory_for_cart()
--      reverses exactly those holds via compensating 'checkout_release'
--      rows - idempotent, a no-op if already released.
--   3. If payment is confirmed, no further inventory action happens: the
--      original hold IS the permanent decrement. Order creation (Task 3)
--      never touches inventory.quantity_on_hand again.
--
-- Naming note: the Milestone 6 plan's Task 1 description called this
-- "release_inventory_for_order", but release only ever happens at session
-- *expiry*, which is always before an order exists - there is no order to
-- key off yet at that point. Keying off cart_id (which the Stripe session's
-- metadata always carries) is both simpler and actually correct for when
-- this fires; named accordingly here rather than following the plan's
-- inexact wording.

alter table public.inventory_events
  drop constraint if exists inventory_events_reason_check;
alter table public.inventory_events
  add constraint inventory_events_reason_check
  check (reason in ('restock', 'order', 'adjustment', 'checkout_hold', 'checkout_release'));
comment on constraint inventory_events_reason_check on public.inventory_events is
  'byo_reservation (Milestone 1''s placeholder) is superseded by checkout_hold/checkout_release, which cover box, snack, and build-a-box holds uniformly through the same Milestone 6 reservation path.';

-- =========================================================================
-- reserve_inventory_for_cart: the only place cart line items are resolved
-- into snack-level stock needs. Never trusts a client-supplied quantity -
-- everything here is re-derived server-side from cart_items/box_items/
-- cart_item_snacks, same trust model as every other checkout-adjacent
-- function in this schema (see is_admin()).
-- =========================================================================

create or replace function public.reserve_inventory_for_cart(p_cart_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_needed record;
  v_updated integer;
  v_result jsonb := '[]'::jsonb;
begin
  for v_needed in (
    select snack_id, sum(quantity)::integer as needed_quantity
    from (
      -- Direct snack lines.
      select ci.snack_id as snack_id, ci.quantity as quantity
      from public.cart_items ci
      where ci.cart_id = p_cart_id and ci.item_type = 'snack'

      union all

      -- Curated/mystery box lines: each component snack x the box's own
      -- cart quantity (box_items is the fixed composition template).
      select bi.snack_id as snack_id, bi.quantity * ci.quantity as quantity
      from public.cart_items ci
      join public.boxes b on b.id = ci.box_id
      join public.box_items bi on bi.box_id = b.id
      where ci.cart_id = p_cart_id and ci.item_type = 'box'
        and b.box_type in ('curated', 'mystery')

      union all

      -- Build-a-box lines: the customer's own snack selection x the box's
      -- cart quantity (cart_items.quantity is always 1 for these per
      -- Milestone 4, multiplied defensively anyway).
      select cis.snack_id as snack_id, cis.quantity * ci.quantity as quantity
      from public.cart_items ci
      join public.boxes b on b.id = ci.box_id
      join public.cart_item_snacks cis on cis.cart_item_id = ci.id
      where ci.cart_id = p_cart_id and ci.item_type = 'box'
        and b.box_type = 'build_a_box'
    ) needed_lines
    group by snack_id
  )
  loop
    update public.inventory
    set quantity_on_hand = quantity_on_hand - v_needed.needed_quantity,
        updated_at = now()
    where snack_id = v_needed.snack_id
      and quantity_on_hand >= v_needed.needed_quantity;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      -- Raising aborts the whole calling transaction, so any earlier
      -- iterations' updates in this same loop are rolled back too - the
      -- "all or nothing" guarantee comes from Postgres's own transaction
      -- semantics, not manual bookkeeping.
      raise exception 'Insufficient stock for snack %', v_needed.snack_id
        using errcode = 'P0001';
    end if;

    insert into public.inventory_events (snack_id, delta, reason, reference_id)
    values (v_needed.snack_id, -v_needed.needed_quantity, 'checkout_hold', p_cart_id);

    v_result := v_result || jsonb_build_object(
      'snack_id', v_needed.snack_id,
      'quantity', v_needed.needed_quantity
    );
  end loop;

  return v_result;
end;
$$;
comment on function public.reserve_inventory_for_cart(uuid) is
  'Atomically reserves stock for every snack implied by a cart''s lines (direct snacks, curated/mystery box_items, build-a-box cart_item_snacks). All-or-nothing: raises and rolls back entirely if any single snack lacks sufficient stock. See Milestone 6 plan, Product Decisions #2 and #4.';

-- =========================================================================
-- release_inventory_for_cart: reverses exactly the checkout_hold rows for
-- one cart. Idempotent - a second call after release is a no-op, since the
-- webhook idempotency ledger (stripe_events) shouldn't be the only thing
-- standing between this and a double-release.
-- =========================================================================

create or replace function public.release_inventory_for_cart(p_cart_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_already_released boolean;
  v_hold record;
begin
  select exists(
    select 1 from public.inventory_events
    where reference_id = p_cart_id and reason = 'checkout_release'
  ) into v_already_released;

  if v_already_released then
    return;
  end if;

  for v_hold in (
    select snack_id, sum(-delta)::integer as held_quantity
    from public.inventory_events
    where reference_id = p_cart_id and reason = 'checkout_hold'
    group by snack_id
  )
  loop
    update public.inventory
    set quantity_on_hand = quantity_on_hand + v_hold.held_quantity,
        updated_at = now()
    where snack_id = v_hold.snack_id;

    insert into public.inventory_events (snack_id, delta, reason, reference_id)
    values (v_hold.snack_id, v_hold.held_quantity, 'checkout_release', p_cart_id);
  end loop;
end;
$$;
comment on function public.release_inventory_for_cart(uuid) is
  'Reverses reserve_inventory_for_cart()''s holds for one cart (Stripe checkout.session.expired). Idempotent by design - safe to call more than once.';

-- =========================================================================
-- increment_drop_units_sold: the atomic guarded increment Milestone 1's
-- schema comments deferred here. A sold-out drop is an expected state, not
-- an error - returns false rather than raising, so a caller can show
-- "sold out" instead of a 500.
-- =========================================================================

create or replace function public.increment_drop_units_sold(p_drop_id uuid, p_qty integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.drops
  set units_sold = units_sold + p_qty,
      updated_at = now()
  where id = p_drop_id
    and units_sold + p_qty <= quantity_limit;

  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$$;
comment on function public.increment_drop_units_sold(uuid, integer) is
  'Atomic guarded increment for drops.units_sold, deferred here from Milestone 1. Returns false (not an exception) when the increment would exceed quantity_limit.';
