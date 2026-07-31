# Milestone 8: Admin Dashboard — Implementation Plan

**Date:** 2026-07-30
**Status:** Approved 2026-07-30 - seven open product decisions (refund
scope, activity-logging backfill, delivery shape, low-stock threshold,
repeat purchase rate definition, image upload scope, subscription renewal
revenue tracking) confirmed with Ted before implementation began
**Branch:** `milestone-8-admin-dashboard`
**Depends on:** Milestone 6 (orders, inventory, Stripe), Milestone 3
(catalog), Milestone 1 (`customer_lifetime_value`, `inventory_events`,
`customer_activity`, `audit_logs`), Milestone 2 (admin role gating already
built), Milestone 7 (customer-facing order/subscription/rewards views this
milestone's mutations must stay consistent with)

Biggest-scope milestone in the roadmap: the business-owner side of the
platform. Operations Dashboard, Boxes/Snacks CRUD with image upload,
inventory adjustment, order fulfillment + refunds, customer detail views,
rewards manual adjustment, and referral/promotion/drop admin CRUD.

---

## Ground truth already in place (verified against the actual migrations
## and current codebase, not assumed)

- `src/app/(admin)/layout.tsx` and `src/app/(admin)/admin/page.tsx` are
  still Milestone 1 placeholders (`Admin Sidebar Placeholder` / `Admin
  Placeholder`) - nothing built yet.
- `src/proxy.ts` already gates every `/admin/:path*` route: redirects to
  `/login` if unauthenticated, redirects to `/account` if authenticated but
  `profiles.role !== 'admin'`. No middleware changes needed - every new
  admin page/route inherits this for free.
- `src/app/api/admin/users/[id]/role/route.ts` already exists (Milestone
  2), fully working: bearer-token auth, admin-role check via `profiles`,
  role update, `audit_logs` insert (`action: 'role_change'`). This is the
  **exact pattern every new admin mutation in this milestone reuses** -
  Task 11 (Settings) is just a UI on top of this existing endpoint, no new
  backend logic.
- `public.is_admin()` (security definer) and the `audit_logs` table
  (`actor_id, action, entity_type, entity_id, before jsonb?, after jsonb?`)
  already exist and are exercised by the role-change route above - reused
  as-is for every mutation below, no schema change needed for audit
  logging itself.
- `boxes`/`snacks` already have `"boxes admin all"` / `"snacks admin all"`
  RLS policies (`using (public.is_admin())`) - the tables already support
  admin writes via RLS; this milestone's Route Handlers use the
  service-role client (repo convention - mutations never rely on RLS as
  the only gate) but RLS is a correct defense-in-depth backstop already in
  place.
- `inventory` is admin-only, no public read policy at all (`"inventory
  admin only"`) - confirmed via its own migration comment: "exposing exact
  stock counts leaks sales-velocity intel." The Operations Dashboard's
  low-stock count and the Inventory admin screen are the *only* places
  real `quantity_on_hand` values are ever exposed, and only to admins.
- `customer_lifetime_value` is a view with `security_invoker = true`
  (`user_id, total_orders, total_spend_cents, first_order_at,
  last_order_at, avg_order_value_cents`), already correctly scoped so an
  admin sees every row and a customer sees only their own. Reused directly
  for both the Customers admin screen and the repeat-purchase-rate metric.
- **Gap found, not assumed:** `customer_activity` (event_type: enum of
  `order_placed | box_viewed | referral_sent | reward_redeemed |
  subscription_paused | preference_updated | drop_viewed`) is defined in
  the schema and has RLS policies, but grepping `src/` confirms **zero**
  application code has ever inserted into it across Milestones 2-7 - only
  the generated `types/supabase.ts` references the table name. A "customer
  activity feed" screen built against this table today would be
  permanently empty. See Product Decision #2.
- **Gap found, not assumed:** `referrals` rows are never created by any
  existing code either - Milestone 7 built read-only
  `getReferralsForUser`/`getReferralCode`, but the actual "a referred
  friend signs up, a `referrals` row is created" logic is explicitly
  Milestone 9's job per the roadmap. So the Referrals admin screen in this
  milestone will also show an empty list until Milestone 9 ships - this is
  expected, not a bug, and is called out again in Task 10.
- `orders.stripe_payment_intent_id` is confirmed populated at order
  creation (`src/app/api/webhooks/stripe/route.ts:148`, taken from the
  Checkout Session's `payment_intent`) - real Stripe refunds (Product
  Decision #1) are possible against one-time-payment orders using this
  field. A subscription's individual billing-cycle invoices are a
  different Stripe object and are explicitly out of scope for the refund
  button (see Task 6).
- `inventory.quantity_on_hand` has **no check constraint preventing
  negative values** today - `reserve_inventory_for_cart`'s guarded
  `where quantity_on_hand >= needed` update prevents checkout from ever
  causing this, but a manual admin adjustment has no such guard yet. Task
  5 adds one.
- No Supabase Storage bucket exists yet for product images -
  `product_images.image_url` has been populated by hand/seed data only so
  far. Task 4 creates the bucket as part of its migration.
- `promotions.used_count` and referral crediting are both explicitly
  documented in the schema's own comments as deferred to Milestone 9. This
  milestone's Promotions/Drops CRUD writes rows admins can manage: it does
  **not** wire `usage_limit`/`expires_at` enforcement at checkout, or
  `drops.units_sold` beyond what `increment_drop_units_sold` (already
  built in Milestone 6) already does.
- **Correction to an earlier draft of this plan:** `public.credit_rewards_points(p_user_id, p_delta_points, p_reason, p_order_id)`
  already exists (Milestone 6, `20260720140000_checkout_rewards_credit.sql`)
  and already does exactly what a new "admin_adjust_rewards" function would
  have duplicated - it atomically writes `rewards_ledger` and updates
  `profiles.rewards_points` in one transaction, and `p_order_id` is
  nullable. Task 1/Task 9 below call this directly with `p_order_id: null`
  and `p_reason: 'admin_adjustment'` instead of adding a near-duplicate
  function.
- **Gap found, not assumed:** the Stripe webhook handler
  (`src/app/api/webhooks/stripe/route.ts`) only handles
  `checkout.session.completed`, `checkout.session.expired`, and
  `customer.subscription.updated`/`.deleted` (status sync only, no
  revenue). There is no `invoice.paid` handler, so **a subscription's
  renewals after month 1 are never recorded in `orders` at all** - real
  money changes hands in Stripe every month, but locally it's invisible
  after the first payment. A revenue dashboard built on `orders` alone
  would show subscription revenue evaporating after each customer's first
  month, which is wrong. See Product Decision #7.

---

## Product Decisions

**1. Refunds call the real Stripe API - approved 2026-07-30.** The admin
Orders screen's Refund action calls `stripe.refunds.create({
payment_intent: order.stripe_payment_intent_id })` for real (Stripe
test-mode in dev/CI, same convention as Milestone 6's Checkout Session
tests), then sets `orders.status = 'refunded'` and writes an `audit_logs`
row, only after Stripe confirms the refund succeeded. Scoped to one-time
payment orders (`stripe_payment_intent_id is not null`); refunding a
specific subscription billing cycle is out of scope for this milestone's
Refund button (a subscription's charges are separate Stripe objects with
their own semantics - flagging for a future milestone rather than
half-building it here).

**2. `customer_activity` logging is backfilled now, scoped to what
already has a real trigger point - approved 2026-07-30.** Wiring in:
`order_placed` (checkout webhook, `checkout.session.completed`),
`preference_updated` (Milestone 7's `PATCH /api/account/preferences`),
`subscription_paused`/cancelled equivalent (Milestone 7's subscription
webhook sync, when status transitions to `paused`/`cancelled`). **Not**
wiring in this milestone: `referral_sent` and `reward_redeemed` (their
underlying features - referral creation, rewards redemption - don't exist
until Milestone 9, so there is nothing real to log yet), and
`box_viewed`/`drop_viewed` (page-view analytics is a materially different,
higher-volume logging shape - client-triggered, needs its own
batching/rate-limit design - and bundling it into this milestone risks
under-designing it under time pressure; revisit as its own small task
later). The Customers admin detail screen's activity feed will therefore
show real data for the three wired event types and nothing for the other
four, which is accurate to reality, not a bug.

**3. One branch, one PR - approved 2026-07-30.** Matches every prior
milestone's delivery pattern (`milestone-8-admin-dashboard`, one PR at the
end), despite this being the largest-scope milestone. Tasks below are
still ordered so each is independently testable and reviewable in
sequence within that single branch.

**4. Low-stock threshold: `quantity_on_hand < 10` - approved 2026-07-30.**
Flat threshold across all snacks, matching the schema's flat-baseline
seed approach. No per-snack configurable threshold in V1 - if the
business needs different reorder points per snack later, that's an
additive `snacks.low_stock_threshold` column, not a blocker now.

**5. Repeat purchase rate: % of all-time customers with 2+ paid orders -
approved 2026-07-30.** `(count of customer_lifetime_value rows where
total_orders >= 2) / (count of all customer_lifetime_value rows) * 100`.
No rolling time window - reuses the existing view directly, no new
time-bucketed query needed.

**6. Real image upload to Supabase Storage - approved 2026-07-30.** A new
`product-images` Storage bucket (public read, admin-only write via a
Storage RLS policy mirroring `is_admin()`), a
`POST /api/admin/uploads` Route Handler validating MIME type (`image/jpeg`,
`image/png`, `image/webp` only) and size (5 MB max, per CLAUDE.md's
existing security rule that has had no implementation until now), then
inserting/updating the corresponding `product_images` row with the real
Storage URL.

**7. Add a real `invoice.paid` webhook handler now, to make subscription
revenue actually accurate - approved 2026-07-30.** Extends the existing
Stripe webhook Route Handler: on `invoice.paid` with
`billing_reason = 'subscription_cycle'` (a renewal, never the first
invoice - that one is already handled by `checkout.session.completed` and
must not be double-counted), creates a new `orders` + `order_items` row
(mirroring the checkout handler's shape: `status: 'paid'`,
`total_amount_cents` from the invoice's `amount_paid`,
`stripe_payment_intent_id` from the invoice, `shipping_address` snapshotted
from the customer's current default `customer_addresses` row at renewal
time, same as a fresh checkout would), credits rewards via
`credit_rewards_points` (renewals earn points same as any other confirmed
payment - Milestone 6 Decision #9 didn't scope "1 point per dollar" to
first-payments-only), and logs `customer_activity` (`order_placed`, Task
8). Idempotent via the same `stripe_events` ledger pattern as every other
handled event. See Task 1B.

---

## Tasks

### Task 1 — Migration: adjust_inventory RPC, revenue view, Storage bucket, negative-inventory guard
- `public.adjust_inventory(p_snack_id uuid, p_delta integer, p_reason
  text, p_reference_id uuid) returns void` (security definer, mirrors
  `reserve_inventory_for_cart`'s pattern) - atomically updates
  `inventory.quantity_on_hand` and inserts `inventory_events`; raises if
  the resulting quantity would be negative (the guard that doesn't exist
  today). No new rewards RPC - `credit_rewards_points` already exists
  (Ground Truth correction above) and is reused directly for admin manual
  adjustments.
- New view `public.revenue_by_stream_daily` - classifies each paid
  order's total by stream (subscription box / one-time box / à la carte
  snack, from `order_items.item_type` and `boxes.is_subscription`),
  grouped by day. `security_invoker = true`, matching
  `customer_lifetime_value`'s own precedent, though in practice only
  admins can read `orders` beyond their own rows anyway. Only accurate
  for the subscription stream once Task 1B's `invoice.paid` handler
  exists - otherwise renewal months are silently missing.
- Creates the `product-images` Storage bucket (public read; insert/update/
  delete gated to `public.is_admin()` via a Storage RLS policy).
- **Test:** integration - `adjust_inventory` raises and leaves
  `quantity_on_hand` unchanged when the delta would go negative, and
  writes exactly one `inventory_events` row when it succeeds;
  `revenue_by_stream_daily` matches a hand-computed total for three seeded
  orders (one of each stream).

### Task 1B — `invoice.paid` webhook handler (Product Decision #7)
- Extends `src/app/api/webhooks/stripe/route.ts`: on `invoice.paid` with
  `billing_reason === 'subscription_cycle'`, resolves the local
  `subscriptions` row (and its `user_id`/`box_id`) from the invoice's
  `subscription` id, creates a new `orders` row (`status: 'paid'`,
  `total_amount_cents` from `invoice.amount_paid`,
  `stripe_payment_intent_id` from the invoice, `shipping_address`
  snapshotted from the customer's current default `customer_addresses`
  row) + one `order_items` row (`item_type: 'box'`, the subscription's
  `box_id`, `quantity: 1`), credits rewards via `credit_rewards_points`,
  and logs `customer_activity` (`order_placed`, ties into Task 8). Skips
  (returns 200, no-op) when `billing_reason` is anything else, since the
  first invoice (`subscription_create`) is already handled by
  `checkout.session.completed` and must not be double-counted. Idempotent
  via the existing `stripe_events` ledger, same as every other handled
  event type.
- **Test:** integration - a `subscription_cycle` invoice creates exactly
  one new order/order_item and credits rewards once; redelivery of the
  same event id is a no-op (idempotent); a `subscription_create` invoice
  is explicitly skipped (no duplicate order alongside the one
  `checkout.session.completed` already created for that same signup).

### Task 2 — Operations Dashboard
- `src/lib/supabase/queries/admin-dashboard.ts`: `getSalesToday`,
  `getOrdersAwaitingFulfillment` (status = `'paid'`), `getLowStockSnacks`
  (Product Decision #4), `getActiveSubscriptionsCount`,
  `getCustomerGrowth` (signups per day, last 30 days),
  `getRepeatPurchaseRate` (Product Decision #5), `getReferralMetrics`
  (sent/converted/reward-payout-total from `referrals` +
  `rewards_ledger` - will read as zero until Milestone 9, per the Ground
  Truth gap above), `getRevenueTrends` (from Task 1's view).
- `src/app/(admin)/admin/page.tsx` replaces the placeholder, renders all
  of the above.
- **Test:** integration - every metric matches a hand-computed value
  against seeded test data (roadmap's own completion criterion: no metric
  ships without a verification query behind it).

### Task 3 — Boxes CRUD
- `POST /api/admin/boxes`, `PATCH /api/admin/boxes/[id]` (including
  `status` transitions draft → active → archived), `DELETE
  /api/admin/boxes/[id]` (soft delete via `deleted_at`, never hard
  delete, per CLAUDE.md). Every mutation writes `audit_logs`
  (`entity_type: 'boxes'`).
- `src/app/(admin)/admin/boxes/page.tsx` (list, filterable by status),
  a create form, an edit form.
- **Test:** integration - create/edit/soft-delete each write the correct
  before/after `audit_logs` row; non-admin gets 403; a box created here
  with `status = 'active'` appears on the live storefront catalog query
  (roadmap's own completion criterion).

### Task 4 — Snacks CRUD + image upload
- `POST /api/admin/snacks`, `PATCH /api/admin/snacks/[id]` (including
  `is_sellable_individually`, `is_byo_eligible`, `price_cents`,
  `category`, `tags`).
- `POST /api/admin/uploads` (Product Decision #6): validates MIME
  type/size server-side, uploads to the `product-images` bucket, then
  `POST /api/admin/snacks/[id]/image` (or box equivalent) upserts the
  `product_images` row, respecting the existing one-primary-per-snack/box
  unique index (same default-swap pattern as Milestone 7's
  `customer_addresses` default-address logic).
- `src/app/(admin)/admin/snacks/page.tsx` (list), create/edit forms with
  an upload control.
- **Test:** integration - rejects an oversized (>5 MB) or wrong-MIME-type
  upload with 400 before anything touches Storage; a valid upload creates
  a real Storage object and a `product_images` row with that URL; setting
  a new primary image un-sets the previous one, never violating the
  unique index.

### Task 5 — Inventory admin
- `POST /api/admin/inventory/[snackId]/adjust` (uses Task 1's
  `adjust_inventory` RPC; `reason` is `'restock'` or `'adjustment'`, per
  the existing check constraint).
- `src/app/(admin)/admin/inventory/page.tsx`: current stock levels +
  `inventory_events` log view (filterable by snack/reason).
- **Test:** integration - a restock increases `quantity_on_hand` and
  writes one `inventory_events` row; an adjustment that would go negative
  is rejected with the stock unchanged (Task 1's guard, exercised here at
  the route level too).

### Task 6 — Orders admin (list/detail/fulfillment/refund)
- `PATCH /api/admin/orders/[id]`: status transitions (`paid` →
  `fulfilled` with a required `tracking_number`, `fulfilled` → `shipped`,
  → `cancelled`), each writing `audit_logs`.
- `POST /api/admin/orders/[id]/refund` (Product Decision #1): rejects
  with 400 if `stripe_payment_intent_id` is null (subscription-only
  order, out of scope per Decision #1); otherwise calls
  `stripe.refunds.create` (mocked in tests, same "mock the third-party
  call itself, not the DB writes around it" convention as Milestone 6's
  Resend-failure test), then sets `status = 'refunded'` only after Stripe
  confirms, writes `audit_logs`.
- `src/app/(admin)/admin/orders/page.tsx` (list, filterable by status),
  `.../orders/[id]/page.tsx` (detail: line items, status control,
  tracking number field, refund button).
- **Test:** integration - marking an order fulfilled with a tracking
  number persists both fields and is admin-only; a refund on an order
  with no `stripe_payment_intent_id` is rejected with 400 and no Stripe
  call attempted; a successful refund updates status and writes
  `audit_logs` only after the (mocked) Stripe call succeeds, not before.
- **Manual verification (not automated):** after marking an order
  fulfilled with a tracking number here, confirm it's visible on
  Milestone 7's `/account/orders/[id]` page for that customer - proves
  the two milestones share the same `orders` row correctly with zero
  changes needed on the Milestone 7 side.

### Task 7 — Customers admin (list/detail)
- `src/lib/supabase/queries/admin-customers.ts`: list (paginated,
  searchable by email), detail (joins `profiles`,
  `customer_lifetime_value`, `customer_preferences`,
  `customer_activity`, `orders`).
- `src/app/(admin)/admin/customers/page.tsx` (list),
  `.../customers/[id]/page.tsx` (detail).
- **Test:** integration - a customer detail's aggregated fields match
  hand-seeded orders/preferences/activity exactly; non-admin gets 403.

### Task 8 — Customer activity logging backfill (Product Decision #2)
- Add `customer_activity` inserts to the three already-existing endpoints
  identified in Ground Truth: the checkout webhook
  (`order_placed`), Milestone 7's preferences `PATCH` route
  (`preference_updated`), and Milestone 7's subscription webhook sync
  (`subscription_paused`/status-appropriate event) - each insert happens
  inside the same transaction/request as the underlying mutation, not as
  a best-effort side call that could silently fail.
- **Test:** integration - each of the three flows, re-run against its
  existing test suite plus a new assertion, now also writes exactly one
  correctly-typed `customer_activity` row.

### Task 9 — Rewards ledger admin
- `POST /api/admin/rewards/adjust` (calls the existing
  `credit_rewards_points` RPC directly with `p_order_id: null`,
  `p_reason: 'admin_adjustment'` - see Ground Truth correction above).
- `src/app/(admin)/admin/rewards/page.tsx`: ledger view (filterable by
  user), manual adjustment form.
- **Test:** integration - a manual adjustment writes the ledger row,
  updates the cached balance, and writes `audit_logs`, all consistently;
  non-admin gets 403.

### Task 10 — Referrals (read-only), Promotions CRUD, Drops CRUD
- Referrals: `src/app/(admin)/admin/referrals/page.tsx` - list/status
  only, no mutation endpoint (there's nothing to mutate yet - referral
  creation is Milestone 9). Will render empty until then; this is
  expected per the Ground Truth gap, not a bug to chase.
- Promotions: `POST/PATCH /api/admin/promotions[/id]` (code,
  discount_type, value, usage_limit, expires_at) - admin data management
  only; checkout-time enforcement is explicitly Milestone 9's job (Ground
  Truth). `src/app/(admin)/admin/promotions/page.tsx`.
- Drops: `POST/PATCH /api/admin/drops[/id]` - replaces Milestone 3's
  hardcoded demo-drop seed migrations with real admin-manageable rows.
  `src/app/(admin)/admin/drops/page.tsx`.
- **Test:** integration - each of Promotions/Drops CRUD writes correct
  `audit_logs`; non-admin gets 403 on every one; Referrals page renders
  correctly with zero rows (proves it's not broken, just empty).

### Task 11 — Settings (admin role management) + admin nav
- UI only: `src/app/(admin)/admin/settings/page.tsx` calls the
  already-existing `PATCH /api/admin/users/[id]/role` (Ground Truth - no
  backend work here at all).
- Replace `src/app/(admin)/layout.tsx`'s placeholder sidebar with real
  navigation across all screens built above, mirroring Milestone 7's
  `(account)` layout nav pattern exactly.
- **Test:** none new (the route's own tests already exist from Milestone
  2); a quick manual check that the UI's role change round-trips.

### Task 12 — Final integration pass
- `npm run typecheck && npm run lint && npm run test`.
- Playwright e2e admin journey: log in as admin → create a box, confirm
  it appears on the live storefront → mark a seeded order fulfilled with
  a tracking number → mark a customer's rewards balance adjusted → adjust
  inventory → confirm Operations Dashboard numbers match what was just
  seeded/changed.

---

## Completion Criteria (mirrors roadmap)

- [ ] Admin creates a box end-to-end and it appears live on the
      storefront
- [ ] Admin marks an order fulfilled and enters a tracking number;
      customer sees the update in Milestone 7's UI
- [ ] A non-admin user gets 403 on every `/admin/*` route and every
      admin-only query is blocked by RLS, not just middleware
- [ ] Every Operations Dashboard metric matches a hand-computed value
      against seeded test data
- [ ] Editing a box price or adjusting a customer's rewards balance
      produces a correct `audit_logs` entry
- [ ] A real Stripe refund (test mode) on a one-time-payment order
      updates status only after Stripe confirms success

## Explicitly out of scope (later milestones' job)

- Referral creation/dual-sided crediting logic (Milestone 9) - this
  milestone only builds the (currently empty) admin list screen
- Promotion code enforcement at checkout (`usage_limit`/`expires_at`,
  atomic guarded `used_count` increment) (Milestone 9)
- Rewards *redemption* at checkout (Milestone 9)
- `box_viewed`/`drop_viewed` page-view activity logging (deferred per
  Product Decision #2 - needs its own client-triggered/batching design)
- Refunding an individual subscription billing cycle/invoice (Product
  Decision #1 scopes the Refund button to one-time-payment orders only)
- Per-snack configurable low-stock thresholds (Product Decision #4 - flat
  threshold for V1)
- Legacy Stripe order backfill into `legacy_orders` (Milestone 10)
