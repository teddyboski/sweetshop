-- Milestone 16, Task 1: merchandise (in-house apparel etc.) schema.
--
-- Neither `snacks` nor `boxes` fit a sellable item with size/color
-- variants and no nutrition/BYO-eligibility concept - this adds a third,
-- parallel product family (merch_items + merch_variants) and threads it
-- through the same polymorphic surfaces `snacks` already uses:
-- product_images, inventory (+ inventory_events), cart_items, order_items.
--
-- Design choice: every merch item goes through merch_variants, even a
-- single-SKU item with no real size/color choice (e.g. a mug) - one code
-- path for "pick a variant, check its stock" rather than two, per Ted's
-- "keep it flexible" answer when this was scoped.

-- =========================================================================
-- merch_items
-- =========================================================================

create table public.merch_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  category text,
  price_cents integer not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.merch_items is 'price_cents is the item''s base/default price - a merch_variants row may override it via price_cents_override (e.g. a larger size costs more). image_url and stock intentionally omitted, same reasoning as snacks: images live in product_images, stock in merch_inventory.';
alter table public.merch_items enable row level security;
create policy "merch_items public read" on public.merch_items for select using (true);
create policy "merch_items admin all" on public.merch_items for all using (public.is_admin());
create index merch_items_category_idx on public.merch_items(category);
create index merch_items_status_idx on public.merch_items(status);

-- =========================================================================
-- merch_variants -- every merch item has at least one row here, even a
-- single-SKU item with no real size/color choice.
-- =========================================================================

create table public.merch_variants (
  id uuid primary key default gen_random_uuid(),
  merch_item_id uuid not null references public.merch_items(id) on delete cascade,
  size text,
  color text,
  sku text unique,
  price_cents_override integer,
  -- A variant is a real catalog identity referenced permanently by
  -- order_items.merch_variant_id, same as a snack or box - it must never be
  -- hard-deleted once it could plausibly have stock movements or orders
  -- against it (this app never hard-deletes catalog rows, per CLAUDE.md).
  -- "Remove" in the admin UI archives a variant rather than DELETEing the
  -- row; archived variants are excluded from the storefront and from the
  -- picker of variants shown for a new checkout, but stay intact for
  -- historical orders/inventory_events to reference.
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.merch_variants is 'price_cents_override is nullable - falls back to the parent merch_items.price_cents when unset. Resolved in application code (see resolveMerchPriceCents), not a DB-level COALESCE view, to keep it a plain, unit-testable function.';
alter table public.merch_variants enable row level security;
create policy "merch_variants public read" on public.merch_variants for select using (true);
create policy "merch_variants admin all" on public.merch_variants for all using (public.is_admin());
create index merch_variants_merch_item_id_idx on public.merch_variants(merch_item_id);
create index merch_variants_status_idx on public.merch_variants(status);

-- =========================================================================
-- merch_inventory / merch_inventory_events -- mirrors inventory/
-- inventory_events exactly (Milestone 1), one row per variant instead of
-- per snack. Kept as separate tables rather than widening the existing
-- snack-scoped ones, since snack_id is `not null` there and this repo's own
-- convention (CLAUDE.md: "repeat yourself twice before extracting a
-- helper") favors a second parallel table over retrofitting nullability
-- and a cross-type check constraint onto a table three other migrations
-- already depend on.
-- =========================================================================

create table public.merch_inventory (
  id uuid primary key default gen_random_uuid(),
  merch_variant_id uuid not null unique references public.merch_variants(id) on delete cascade,
  quantity_on_hand integer not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.merch_inventory is 'Admin-only, not publicly readable - same rationale as inventory: exact stock counts leak sales-velocity intel. Storefront in-stock/low-stock display must be a derived boolean computed server-side.';
alter table public.merch_inventory enable row level security;
create policy "merch_inventory admin only" on public.merch_inventory for all using (public.is_admin());

create table public.merch_inventory_events (
  id uuid primary key default gen_random_uuid(),
  merch_variant_id uuid not null references public.merch_variants(id),
  delta integer not null,
  reason text not null check (reason in ('restock', 'order', 'adjustment', 'checkout_hold', 'checkout_release')),
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.merch_inventory_events is 'Append-only audit trail behind merch_inventory.quantity_on_hand, mirroring inventory_events (including its checkout_hold/checkout_release reservation reasons from the 20260730130000 migration - merch reserves at Stripe Checkout session creation exactly like snacks/boxes, see reserve_inventory_for_cart below).';
alter table public.merch_inventory_events enable row level security;
create policy "merch_inventory_events admin only" on public.merch_inventory_events for all using (public.is_admin());
create index merch_inventory_events_variant_id_idx on public.merch_inventory_events(merch_variant_id);
create index merch_inventory_events_created_at_idx on public.merch_inventory_events(created_at);

-- =========================================================================
-- product_images: extend the exactly-one-of owner check to a 3-way.
-- =========================================================================

alter table public.product_images
  add column merch_item_id uuid references public.merch_items(id) on delete cascade;

alter table public.product_images drop constraint product_images_owner_check;
alter table public.product_images add constraint product_images_owner_check check (
  (box_id is not null and snack_id is null and merch_item_id is null) or
  (snack_id is not null and box_id is null and merch_item_id is null) or
  (merch_item_id is not null and box_id is null and snack_id is null)
);

create index product_images_merch_item_id_idx on public.product_images(merch_item_id);
create unique index product_images_one_primary_per_merch_item
  on public.product_images(merch_item_id) where is_primary and merch_item_id is not null;

-- =========================================================================
-- cart_items / order_items: extend item_type to 'merch'. A merch line
-- needs both merch_item_id (display/reporting) and merch_variant_id (the
-- specific size/color actually being purchased, which is what price and
-- stock resolve against).
-- =========================================================================

alter table public.cart_items
  add column merch_item_id uuid references public.merch_items(id),
  add column merch_variant_id uuid references public.merch_variants(id);

alter table public.cart_items drop constraint cart_items_item_type_check;
alter table public.cart_items add constraint cart_items_item_type_check check (item_type in ('box', 'snack', 'merch'));

alter table public.cart_items drop constraint cart_items_item_ref_check;
alter table public.cart_items add constraint cart_items_item_ref_check check (
  (item_type = 'box' and box_id is not null and snack_id is null and merch_variant_id is null) or
  (item_type = 'snack' and snack_id is not null and box_id is null and merch_variant_id is null) or
  (item_type = 'merch' and merch_variant_id is not null and merch_item_id is not null and box_id is null and snack_id is null)
);

create index cart_items_merch_variant_id_idx on public.cart_items(merch_variant_id);

alter table public.order_items
  add column merch_item_id uuid references public.merch_items(id),
  add column merch_variant_id uuid references public.merch_variants(id);

alter table public.order_items drop constraint order_items_item_type_check;
alter table public.order_items add constraint order_items_item_type_check check (item_type in ('box', 'snack', 'merch'));

alter table public.order_items drop constraint order_items_item_ref_check;
alter table public.order_items add constraint order_items_item_ref_check check (
  (item_type = 'box' and box_id is not null and snack_id is null and merch_variant_id is null) or
  (item_type = 'snack' and snack_id is not null and box_id is null and merch_variant_id is null) or
  (item_type = 'merch' and merch_variant_id is not null and merch_item_id is not null and box_id is null and snack_id is null)
);

create index order_items_merch_variant_id_idx on public.order_items(merch_variant_id);

-- =========================================================================
-- adjust_merch_inventory: manual-adjustment counterpart for merch, mirrors
-- adjust_inventory (20260730130000_admin_dashboard_foundations.sql) exactly.
-- =========================================================================

create or replace function public.adjust_merch_inventory(
  p_merch_variant_id uuid,
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
  update public.merch_inventory
  set quantity_on_hand = quantity_on_hand + p_delta,
      updated_at = now()
  where merch_variant_id = p_merch_variant_id
    and quantity_on_hand + p_delta >= 0;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Adjustment would make quantity_on_hand negative for merch variant %', p_merch_variant_id
      using errcode = 'P0001';
  end if;

  insert into public.merch_inventory_events (merch_variant_id, delta, reason, reference_id)
  values (p_merch_variant_id, p_delta, p_reason, p_reference_id);
end;
$$;
comment on function public.adjust_merch_inventory(uuid, integer, text, uuid) is
  'Atomic manual merch stock adjustment (admin restock/correction) with a floor guard against negative quantity_on_hand. See adjust_inventory for the snack-scoped precedent this mirrors.';

-- =========================================================================
-- reserve_inventory_for_cart / release_inventory_for_cart: extend to also
-- reserve merch lines, in the same all-or-nothing transaction as the
-- existing snack reservation. A cart with both a box and a merch item must
-- either fully reserve or fully fail, never half-reserve.
-- =========================================================================

create or replace function public.reserve_inventory_for_cart(p_cart_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_needed record;
  v_needed_merch record;
  v_updated integer;
  v_result jsonb := '[]'::jsonb;
begin
  for v_needed in (
    select snack_id, sum(needed_quantity)::integer as needed_quantity
    from (
      select ci.snack_id as snack_id, ci.quantity as needed_quantity
      from public.cart_items ci
      where ci.cart_id = p_cart_id and ci.item_type = 'snack'

      union all

      select bi.snack_id as snack_id, bi.quantity * ci.quantity as needed_quantity
      from public.cart_items ci
      join public.boxes b on b.id = ci.box_id
      join public.box_items bi on bi.box_id = b.id
      where ci.cart_id = p_cart_id and ci.item_type = 'box'
        and b.box_type in ('curated', 'mystery')

      union all

      select cis.snack_id as snack_id, cis.quantity * ci.quantity as needed_quantity
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

  for v_needed_merch in (
    select ci.merch_variant_id as merch_variant_id, sum(ci.quantity)::integer as needed_quantity
    from public.cart_items ci
    where ci.cart_id = p_cart_id and ci.item_type = 'merch'
    group by ci.merch_variant_id
  )
  loop
    update public.merch_inventory
    set quantity_on_hand = quantity_on_hand - v_needed_merch.needed_quantity,
        updated_at = now()
    where merch_variant_id = v_needed_merch.merch_variant_id
      and quantity_on_hand >= v_needed_merch.needed_quantity;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      raise exception 'Insufficient stock for merch variant %', v_needed_merch.merch_variant_id
        using errcode = 'P0001';
    end if;

    insert into public.merch_inventory_events (merch_variant_id, delta, reason, reference_id)
    values (v_needed_merch.merch_variant_id, -v_needed_merch.needed_quantity, 'checkout_hold', p_cart_id);

    v_result := v_result || jsonb_build_object(
      'merch_variant_id', v_needed_merch.merch_variant_id,
      'quantity', v_needed_merch.needed_quantity
    );
  end loop;

  return v_result;
end;
$$;
comment on function public.reserve_inventory_for_cart(uuid) is
  'Atomically reserves stock for every snack AND merch variant implied by a cart''s lines. All-or-nothing across both: raises and rolls back entirely if any single snack or merch variant lacks sufficient stock. Extended in Milestone 16 from the Milestone 6 snack/box-only version.';

create or replace function public.release_inventory_for_cart(p_cart_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_already_released boolean;
  v_hold record;
  v_merch_hold record;
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

  for v_merch_hold in (
    select merch_variant_id, sum(-delta)::integer as held_quantity
    from public.merch_inventory_events
    where reference_id = p_cart_id and reason = 'checkout_hold'
    group by merch_variant_id
  )
  loop
    update public.merch_inventory
    set quantity_on_hand = quantity_on_hand + v_merch_hold.held_quantity,
        updated_at = now()
    where merch_variant_id = v_merch_hold.merch_variant_id;

    insert into public.merch_inventory_events (merch_variant_id, delta, reason, reference_id)
    values (v_merch_hold.merch_variant_id, v_merch_hold.held_quantity, 'checkout_release', p_cart_id);
  end loop;
end;
$$;
comment on function public.release_inventory_for_cart(uuid) is
  'Reverses reserve_inventory_for_cart()''s holds for one cart, across both snack and merch reservations. Idempotent by design - the snack-side "already released" check alone gates both, since both are only ever written together by the same reserve call.';

-- =========================================================================
-- revenue_by_stream_daily: without this, every merch order_item would
-- silently fall into the "a_la_carte_snack" catch-all bucket (the CASE
-- statement's ELSE) and misreport revenue by stream. Small, necessary
-- correctness fix alongside the schema that makes merch order_items
-- possible in the first place.
-- =========================================================================

create or replace view public.revenue_by_stream_daily
with (security_invoker = true) as
select
  date_trunc('day', o.created_at)::date as revenue_date,
  case
    when oi.item_type = 'box' and b.is_subscription then 'subscription'
    when oi.item_type = 'box' and not b.is_subscription then 'one_time_box'
    when oi.item_type = 'merch' then 'merchandise'
    else 'a_la_carte_snack'
  end as revenue_stream,
  sum(oi.unit_price_cents * oi.quantity) as revenue_cents
from public.order_items oi
join public.orders o on o.id = oi.order_id
left join public.boxes b on b.id = oi.box_id
where o.status = 'paid' and o.deleted_at is null
group by revenue_date, revenue_stream;
comment on view public.revenue_by_stream_daily is
  'security_invoker = true, matching the original view''s own precedent. Extended in Milestone 16 to break out a merchandise revenue stream instead of letting it fall into a_la_carte_snack by default.';
