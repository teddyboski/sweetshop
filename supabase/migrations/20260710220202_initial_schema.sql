-- Milestone 1, Task 6: V1 schema with RLS.
--
-- Documentation notes (per Milestone 1 Task 6 schema review):
--
-- 1. `profiles` replaces `public.users`. auth.users (Supabase Auth) is the
--    identity source of truth; `public.profiles` is a 1:1 extension (same id)
--    holding business/app data only. Every foreign key across this schema
--    that references a person is still named `user_id` (not `profile_id`) --
--    a deliberate, permanent exception to the `<table_singular>_id` naming
--    convention, because it references the *user's identity* (auth.uid()),
--    which is the vocabulary every RLS policy below already uses.
--
-- 2. `profiles.rewards_points` is a CACHED running balance for fast reads
--    only. `rewards_ledger` is the source of truth. `rewards_points` must
--    never be written outside of the same transaction as the corresponding
--    `rewards_ledger` insert (enforced at the application layer in the
--    rewards/checkout Route Handlers built in later milestones -- no DB
--    trigger yet, see the deferred-functions note in the schema design doc).
--
-- 3. Anonymous cart security (`carts.anonymous_id`):
--    - Generated server-side with a cryptographically random uuid
--      (gen_random_uuid()), never accepted as client-supplied input.
--    - Anonymous carts are reachable ONLY through /api/cart/* Route
--      Handlers using the server/admin Supabase client.
--    - No RLS policy on `carts`/`cart_items`/`cart_item_snacks` grants the
--      anon key access to a row identified only by anonymous_id -- there is
--      no policy for that case at all, so it is unreachable via direct
--      client queries by design (default-deny). The owner policy below is a
--      defense-in-depth backstop for authenticated carts, not the primary
--      access path.

create extension if not exists "pgcrypto";

-- =========================================================================
-- profiles
-- =========================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  stripe_customer_id text,
  rewards_points integer not null default 0,
  referral_code text unique not null default encode(gen_random_bytes(6), 'hex'),
  referred_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.profiles is 'Application profile data for an authenticated user. auth.users is the identity source of truth; this table is a 1:1 extension via id, business data only. See migration header note 1 on why FKs stay named user_id.';
comment on column public.profiles.rewards_points is 'Cached balance only -- rewards_ledger is the source of truth. See migration header note 2.';

-- Helper: is_admin() -- security definer so it bypasses RLS on the inner
-- lookup and avoids recursive policy evaluation on `profiles`.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
create policy "profiles select own" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "profiles update own" on public.profiles for update using (auth.uid() = id or public.is_admin());

-- Column-level protection: RLS above restricts which *rows* a customer can
-- touch, not which *columns* -- without this trigger, "profiles update own"
-- would let a customer set their own role to admin or rewrite billing /
-- referral fields directly (e.g. supabase.from('profiles').update({role:
-- 'admin'})). Every other current and future column stays freely editable
-- by the row owner.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
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
  if new.referred_by is distinct from old.referred_by then
    raise exception 'referred_by cannot be changed by the account owner';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Auto-provisions a public.profiles row whenever a new auth.users row is
-- created, so every signed-up user has a profile immediately. SECURITY
-- DEFINER is required here because public.profiles intentionally has no
-- INSERT policy for anon/authenticated -- inserts happen only via this
-- trigger (or the service-role key), never directly from the client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- customer_preferences
-- =========================================================================

create table public.customer_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  dietary_restrictions text[] not null default '{}',
  disliked_categories text[] not null default '{}',
  flavor_profile text[] not null default '{}',
  spice_tolerance text,
  marketing_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_preferences enable row level security;
create policy "customer_preferences own" on public.customer_preferences for all using (
  auth.uid() = user_id or public.is_admin()
);

-- =========================================================================
-- customer_addresses
-- =========================================================================

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  recipient_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.customer_addresses enable row level security;
create policy "customer_addresses own" on public.customer_addresses for all using (
  auth.uid() = user_id or public.is_admin()
);
create index customer_addresses_user_id_idx on public.customer_addresses(user_id);
create unique index customer_addresses_one_default_per_user
  on public.customer_addresses(user_id) where is_default and deleted_at is null;

-- =========================================================================
-- boxes
-- =========================================================================

create table public.boxes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  price_cents integer not null,
  is_subscription boolean not null default false,
  cadence text,
  box_type text not null default 'curated' check (box_type in ('curated', 'build_a_box', 'mystery')),
  slot_count integer,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on column public.boxes.slot_count is 'Required only when box_type = build_a_box. Enforced at the application/Zod layer, not a DB check constraint, since a clean cross-field conditional check is awkward in SQL.';
alter table public.boxes enable row level security;
create policy "boxes public read active" on public.boxes for select using (status = 'active' and deleted_at is null);
create policy "boxes admin all" on public.boxes for all using (public.is_admin());
create index boxes_status_idx on public.boxes(status);
create index boxes_box_type_idx on public.boxes(box_type);

-- =========================================================================
-- snacks
-- =========================================================================

create table public.snacks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  brand text,
  category text,
  tags text[] not null default '{}',
  nutrition_json jsonb,
  price_cents integer,
  is_sellable_individually boolean not null default false,
  is_byo_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.snacks is 'image_url and inventory_count intentionally omitted -- images live in product_images, stock in inventory.';
alter table public.snacks enable row level security;
create policy "snacks public read" on public.snacks for select using (true);
create policy "snacks admin all" on public.snacks for all using (public.is_admin());
create index snacks_category_idx on public.snacks(category);
create index snacks_tags_idx on public.snacks using gin (tags);

-- =========================================================================
-- product_images
-- =========================================================================

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  box_id uuid references public.boxes(id) on delete cascade,
  snack_id uuid references public.snacks(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_images_owner_check check (
    (box_id is not null and snack_id is null) or
    (snack_id is not null and box_id is null)
  )
);
alter table public.product_images enable row level security;
create policy "product_images public read" on public.product_images for select using (true);
create policy "product_images admin all" on public.product_images for all using (public.is_admin());
create index product_images_box_id_idx on public.product_images(box_id);
create index product_images_snack_id_idx on public.product_images(snack_id);
create unique index product_images_one_primary_per_box
  on public.product_images(box_id) where is_primary and box_id is not null;
create unique index product_images_one_primary_per_snack
  on public.product_images(snack_id) where is_primary and snack_id is not null;

-- =========================================================================
-- box_items -- fixed composition template for curated/mystery boxes only.
-- build_a_box rows never populate this table; see order_item_snacks.
-- =========================================================================

create table public.box_items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);
alter table public.box_items enable row level security;
create policy "box_items public read" on public.box_items for select using (true);
create policy "box_items admin all" on public.box_items for all using (public.is_admin());
create index box_items_box_id_idx on public.box_items(box_id);
create index box_items_snack_id_idx on public.box_items(snack_id);

-- =========================================================================
-- inventory -- scoped to snacks only; a box's availability derives from its
-- component snacks' stock, computed at read time, not stored separately.
-- =========================================================================

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  snack_id uuid not null unique references public.snacks(id) on delete cascade,
  quantity_on_hand integer not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.inventory is 'Admin-only, not publicly readable -- exposing exact stock counts leaks sales-velocity intel. Storefront in-stock/low-stock display must be a derived boolean computed server-side, not a raw count read by the client.';
alter table public.inventory enable row level security;
create policy "inventory admin only" on public.inventory for all using (public.is_admin());

-- =========================================================================
-- inventory_events -- append-only audit trail behind inventory.quantity_on_hand
-- =========================================================================

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  snack_id uuid not null references public.snacks(id),
  delta integer not null,
  reason text not null check (reason in ('restock', 'order', 'adjustment', 'byo_reservation')),
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.inventory_events enable row level security;
create policy "inventory_events admin only" on public.inventory_events for all using (public.is_admin());
create index inventory_events_snack_id_idx on public.inventory_events(snack_id);
create index inventory_events_created_at_idx on public.inventory_events(created_at);

-- =========================================================================
-- carts / cart_items / cart_item_snacks
-- See migration header note 3 on anonymous cart security.
-- =========================================================================

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  anonymous_id uuid,
  status text not null default 'active' check (status in ('active', 'abandoned', 'converted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_owner_check check (user_id is not null or anonymous_id is not null)
);
comment on table public.carts is 'All cart reads/writes go through /api/cart/* Route Handlers using the server/admin Supabase client. Anonymous carts (user_id null) have no RLS policy granting anon-key access at all -- unreachable by direct client query, by design. See migration header note 3.';
comment on column public.carts.anonymous_id is 'Server-generated cryptographically random uuid, stored in an httpOnly cookie by the Route Handler. Never client-supplied.';
alter table public.carts enable row level security;
create policy "carts owner all" on public.carts for all using (auth.uid() = user_id or public.is_admin());
create index carts_user_id_idx on public.carts(user_id);
create index carts_anonymous_id_idx on public.carts(anonymous_id);
create index carts_status_idx on public.carts(status);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  item_type text not null check (item_type in ('box', 'snack')),
  box_id uuid references public.boxes(id),
  snack_id uuid references public.snacks(id),
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_item_ref_check check (
    (item_type = 'box' and box_id is not null and snack_id is null) or
    (item_type = 'snack' and snack_id is not null and box_id is null)
  )
);
alter table public.cart_items enable row level security;
create policy "cart_items via cart" on public.cart_items for all using (
  exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = auth.uid() or public.is_admin()))
);
create index cart_items_cart_id_idx on public.cart_items(cart_id);
create index cart_items_box_id_idx on public.cart_items(box_id);
create index cart_items_snack_id_idx on public.cart_items(snack_id);

create table public.cart_item_snacks (
  id uuid primary key default gen_random_uuid(),
  cart_item_id uuid not null references public.cart_items(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);
comment on table public.cart_item_snacks is 'In-progress Build-a-Box snack selection, mirrors order_item_snacks. Copied into order_item_snacks at checkout.';
alter table public.cart_item_snacks enable row level security;
create policy "cart_item_snacks via cart" on public.cart_item_snacks for all using (
  exists (
    select 1 from public.cart_items ci
    join public.carts c on c.id = ci.cart_id
    where ci.id = cart_item_id and (c.user_id = auth.uid() or public.is_admin())
  )
);
create index cart_item_snacks_cart_item_id_idx on public.cart_item_snacks(cart_item_id);
create index cart_item_snacks_snack_id_idx on public.cart_item_snacks(snack_id);

-- =========================================================================
-- orders / order_items / order_item_snacks
-- =========================================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'shipped', 'cancelled', 'refunded')),
  total_amount_cents integer not null default 0,
  shipping_address jsonb,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on column public.orders.shipping_address is 'Point-in-time snapshot copied from customer_addresses (or entered fresh) at checkout -- intentionally not a foreign key, so editing/deleting a saved address never alters historical order records.';
comment on table public.orders is 'Orders are created server-side only, by the checkout Route Handler after Stripe confirms payment via webhook (service-role key, bypasses RLS) -- never inserted directly by the client. Consistent with order_items/order_item_snacks/subscriptions/rewards_ledger, which are also admin/service-role write-only. The RLS insert policy below is a defense-in-depth backstop, not the intended write path.';
alter table public.orders enable row level security;
create policy "orders select own" on public.orders for select using (auth.uid() = user_id or public.is_admin());
create policy "orders insert admin only" on public.orders for insert with check (public.is_admin());
create policy "orders admin update" on public.orders for update using (public.is_admin());
create index orders_user_id_idx on public.orders(user_id);
create index orders_status_idx on public.orders(status);
create index orders_created_at_idx on public.orders(created_at);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_type text not null check (item_type in ('box', 'snack')),
  box_id uuid references public.boxes(id),
  snack_id uuid references public.snacks(id),
  quantity integer not null default 1,
  unit_price_cents integer not null,
  created_at timestamptz not null default now(),
  constraint order_items_item_ref_check check (
    (item_type = 'box' and box_id is not null and snack_id is null) or
    (item_type = 'snack' and snack_id is not null and box_id is null)
  )
);
alter table public.order_items enable row level security;
create policy "order_items select via order" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);
create policy "order_items admin write" on public.order_items for all using (public.is_admin());
create index order_items_order_id_idx on public.order_items(order_id);
create index order_items_box_id_idx on public.order_items(box_id);
create index order_items_snack_id_idx on public.order_items(snack_id);

create table public.order_item_snacks (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);
comment on table public.order_item_snacks is 'Customer''s actual snack selection for a build_a_box order_item. Populated only when the parent order_item''s box has box_type = build_a_box. The checkout Route Handler''s Zod schema validates sum(quantity) = boxes.slot_count before insert.';
alter table public.order_item_snacks enable row level security;
create policy "order_item_snacks select via order" on public.order_item_snacks for select using (
  exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id and (o.user_id = auth.uid() or public.is_admin())
  )
);
create policy "order_item_snacks admin write" on public.order_item_snacks for all using (public.is_admin());
create index order_item_snacks_order_item_id_idx on public.order_item_snacks(order_item_id);
create index order_item_snacks_snack_id_idx on public.order_item_snacks(snack_id);

-- =========================================================================
-- subscriptions
-- =========================================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  box_id uuid not null references public.boxes(id),
  stripe_subscription_id text unique,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'past_due')),
  next_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "subscriptions select own" on public.subscriptions for select using (auth.uid() = user_id or public.is_admin());
create policy "subscriptions admin write" on public.subscriptions for all using (public.is_admin());
create index subscriptions_user_id_idx on public.subscriptions(user_id);
create index subscriptions_status_idx on public.subscriptions(status);
create index subscriptions_next_delivery_at_idx on public.subscriptions(next_delivery_at);

-- =========================================================================
-- rewards_ledger
-- =========================================================================

create table public.rewards_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  delta_points integer not null,
  reason text not null,
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);
comment on table public.rewards_ledger is 'Source of truth for a user''s rewards balance. See migration header note 2 -- profiles.rewards_points is a cache derived from this table, never written independently.';
alter table public.rewards_ledger enable row level security;
create policy "rewards_ledger select own" on public.rewards_ledger for select using (auth.uid() = user_id or public.is_admin());
create policy "rewards_ledger admin write" on public.rewards_ledger for insert with check (public.is_admin());
create index rewards_ledger_user_id_idx on public.rewards_ledger(user_id);

-- =========================================================================
-- referrals
-- =========================================================================

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referred_id uuid not null unique references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'credited')),
  reward_issued_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_id <> referred_id)
);
alter table public.referrals enable row level security;
create policy "referrals select own" on public.referrals for select using (
  auth.uid() = referrer_id or auth.uid() = referred_id or public.is_admin()
);
create policy "referrals admin write" on public.referrals for all using (public.is_admin());
create index referrals_referrer_id_idx on public.referrals(referrer_id);

-- =========================================================================
-- drops
-- =========================================================================

create table public.drops (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  quantity_limit integer not null,
  units_sold integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.drops.units_sold is 'Naive read-then-write increments race under concurrent checkout traffic. An atomic guarded increment function is deferred to Milestone 6 (Checkout) -- see schema design doc, not implemented in this migration.';
alter table public.drops enable row level security;
create policy "drops public read" on public.drops for select using (true);
create policy "drops admin write" on public.drops for all using (public.is_admin());
create index drops_box_id_idx on public.drops(box_id);
create index drops_active_window_idx on public.drops(starts_at, ends_at);

-- =========================================================================
-- promotions
-- =========================================================================

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value numeric not null,
  usage_limit integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.promotions.used_count is 'Same race-condition caveat as drops.units_sold. Atomic guarded increment deferred to Milestone 9 (Rewards & Referrals) -- see schema design doc.';
alter table public.promotions enable row level security;
create policy "promotions public read" on public.promotions for select using (true);
create policy "promotions admin write" on public.promotions for all using (public.is_admin());
create index promotions_expires_at_idx on public.promotions(expires_at);

-- =========================================================================
-- customer_activity
-- =========================================================================

create table public.customer_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in (
    'order_placed', 'box_viewed', 'referral_sent', 'reward_redeemed',
    'subscription_paused', 'preference_updated', 'drop_viewed'
  )),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.customer_activity enable row level security;
create policy "customer_activity select own" on public.customer_activity for select using (
  auth.uid() = user_id or public.is_admin()
);
create policy "customer_activity insert own" on public.customer_activity for insert with check (
  auth.uid() = user_id or public.is_admin()
);
create index customer_activity_user_id_idx on public.customer_activity(user_id);
create index customer_activity_event_type_idx on public.customer_activity(event_type);

-- =========================================================================
-- audit_logs
-- =========================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy "audit_logs admin only" on public.audit_logs for all using (public.is_admin());
create index audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

-- =========================================================================
-- legacy_orders
-- =========================================================================

create table public.legacy_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_payment_intent_id text unique not null,
  email text not null,
  amount_cents integer not null,
  product_description text,
  created_at timestamptz not null,
  matched_user_id uuid references public.profiles(id)
);
alter table public.legacy_orders enable row level security;
create policy "legacy_orders admin only" on public.legacy_orders for all using (public.is_admin());
create index legacy_orders_email_idx on public.legacy_orders(email);

-- =========================================================================
-- stripe_events -- webhook idempotency ledger.
-- No RLS policy is created: default-deny means neither anon nor
-- authenticated roles can read or write this table under any circumstance.
-- Only the service-role key (which bypasses RLS entirely) touches it, from
-- the webhook Route Handler.
-- =========================================================================

create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);
comment on table public.stripe_events is 'Webhook idempotency ledger: INSERT ... ON CONFLICT (id) DO NOTHING before processing an event; zero rows affected means already handled. No RLS policy -- unreachable except via the service-role key.';
alter table public.stripe_events enable row level security;

-- =========================================================================
-- customer_lifetime_value (view, not a stored table)
-- =========================================================================

create view public.customer_lifetime_value
with (security_invoker = true) as
select
  o.user_id,
  count(*) as total_orders,
  sum(o.total_amount_cents) as total_spend_cents,
  min(o.created_at) as first_order_at,
  max(o.created_at) as last_order_at,
  avg(o.total_amount_cents) as avg_order_value_cents
from public.orders o
where o.status = 'paid' and o.deleted_at is null
group by o.user_id;
comment on view public.customer_lifetime_value is 'security_invoker = true so RLS on orders is enforced for the querying role -- customers see only their own aggregate row, admins see all. Without this, views run with the creator''s privileges and bypass RLS entirely, leaking every customer''s spend to any authenticated user.';
