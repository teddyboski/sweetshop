# Milestone 6: Checkout — Implementation Plan

**Date:** 2026-07-20
**Status:** Approved 2026-07-20 - all three open product decisions
(subscription pricing, inventory reservation timing, retroactive rewards)
confirmed with Ted before implementation began
**Branch:** `milestone-6-checkout`
**Depends on:** Milestone 5 (cart + live total), Milestone 2 (guest-checkout schema
contract, already migrated), Milestone 1 (`orders`/`order_items`/
`order_item_snacks`/`subscriptions`/`inventory`/`inventory_events`/
`stripe_events` already exist)

Turns a cart into a paid order: Stripe Checkout session creation, webhook
processing, inventory holds, subscription billing, and the confirmation
email. Per the roadmap, this is the highest-risk milestone (payments,
webhooks, money).

---

## Ground truth already in place (verified against the actual migrations,
## not assumed)

- `orders.user_id` is nullable; `guest_email` exists with a check constraint
  requiring exactly one of the two set (`20260718150759_guest_checkout.sql`).
  Guest checkout is already a resolved, migrated decision - this milestone
  just has to honor it, not redesign it.
- `order_items`/`order_item_snacks` already mirror `cart_items`/
  `cart_item_snacks` exactly, including the same `item_type` check
  constraint and BYO-selection pattern.
- `stripe_events(id text primary key, type, processed_at)` already exists
  specifically as a webhook idempotency ledger - `insert ... on conflict
  (id) do nothing`, zero rows affected means already processed.
- `inventory` is snack-scoped only; a box's stock is derived from its
  component snacks (`box_items` for curated/mystery, `order_item_snacks`
  for build-a-box) at read/reservation time, never stored per-box.
- `inventory_events.reason` currently only allows `('restock', 'order',
  'adjustment', 'byo_reservation')` - this migration's own comment says the
  atomic guarded increment for both `inventory.quantity_on_hand` and
  `drops.units_sold` was deliberately deferred to this milestone.
- `orders`/`order_items`/`rewards_ledger` all have admin-only RLS insert
  policies - the checkout and webhook Route Handlers write through the
  service-role client, same pattern as every other write path in this repo.

---

## Product Decisions

**1. Subscription pricing follows the box's current price - approved
2026-07-20.** A subscription bills whatever `boxes.price_cents` is at each
cycle, not a flat fee. Consistent with the cart's own live-pricing
principle from Milestone 5 (Product Decision #7) and CLAUDE.md's payments
architecture (Stripe owns subscription billing state; we sync via
webhooks). Mechanically: the Stripe Price used for a subscription's
recurring line item is looked up/created from the box's *current*
`price_cents` at each Checkout session creation - not cached long-term - so
a box price change is reflected on the customer's *next* checkout/renewal,
matching how ISR and the cart already treat price as always-current, never
snapshotted client-side.

**2. Inventory reservation happens at Checkout session creation - approved
2026-07-20.** The moment a customer starts Stripe Checkout, we atomically
decrement `inventory.quantity_on_hand` for every snack implied by their
cart (direct snack lines, each curated/mystery box's `box_items`
composition, each build-a-box's `cart_item_snacks` selection) inside one
Postgres transaction - if any snack lacks sufficient stock, the whole
reservation fails and no Stripe session is created (cart unchanged, clear
error shown). This requires a new atomic SQL function (below), guarding
against the exact race Milestone 1's schema comments already flagged for
`drops.units_sold`. A reservation is released (stock credited back) if the
Stripe session expires unpaid; it becomes permanent (no further inventory
action) on confirmed payment - the hold IS the decrement, there's no
separate second decrement at fulfillment.

**3. `inventory_events.reason` gets two new values via a new migration:
`checkout_hold` (reservation at session creation) and `checkout_release`
(session expired/cancelled unpaid).** `byo_reservation` (already in the
check constraint) is superseded by this more general pair - it covers
box/snack/build-a-box holds uniformly, not just BYO, since all three now go
through the same reservation path. `'order'` stays reserved for
admin-recorded manual order adjustments, not the automatic checkout
decrement.

**4. Atomic reservation is one Postgres function, not N separate
round-trips.** `public.reserve_inventory_for_cart(cart_id uuid) returns
jsonb` resolves the cart's lines into a snack_id → quantity-needed map
(server-side, from `box_items`/`cart_item_snacks`, never trusting a
client-supplied quantity list), then in a single transaction attempts
`update inventory set quantity_on_hand = quantity_on_hand - needed where
snack_id = x and quantity_on_hand >= needed` for every snack - if any
update affects zero rows (insufficient stock), the function raises and the
whole transaction rolls back atomically, so a customer never sees a
half-reserved cart. Mirrors the existing `is_admin()` pattern: a
`security definer` SQL/plpgsql function, called via `admin.rpc(...)` from
the checkout Route Handler.

**5. Webhook event selection: `checkout.session.completed` (not
`payment_intent.succeeded`) is the order-creation trigger.** Checkout
Sessions already carry the cart/order context we need in `metadata`
without a second lookup, and for subscription-mode sessions,
`payment_intent.succeeded` doesn't fire the same way a one-time payment
does - `checkout.session.completed` is the one event guaranteed to fire for
both modes. `checkout.session.expired` is the reservation-release trigger.
Both are verified via Stripe's signature check before any processing, per
CLAUDE.md's payments architecture.

**6. Guest checkout stays exactly as Milestone 2 already designed it - no
redesign here.** The Checkout Route Handler branches on whether a bearer
token is present (same auth pattern as every Milestone 4/5 cart mutation):
authenticated → `orders.user_id` set; guest → `orders.guest_email` set from
a required email field in the checkout form. No account creation forced.

**7. Rewards points are credited inside the same webhook transaction that
creates the order - only for authenticated purchases, and never
retroactively - approved 2026-07-20.** A guest order has no `user_id` to
credit. If that guest later signs up with a matching email and their
orders get backfilled onto the new account (Milestone 2's documented
mechanism), those backfilled orders permanently earn zero rewards points -
rewards only accrue on orders placed while already logged in. Simpler, and
avoids any incentive to game guest-checkout-then-signup for backdated
points.

---

## Tasks

### Task 1 — Migration: atomic inventory reservation + reason values
- New migration: extend `inventory_events.reason` check constraint to add
  `checkout_hold`/`checkout_release`; add
  `public.reserve_inventory_for_cart(cart_id uuid) returns jsonb` and
  `public.release_inventory_for_order(order_id uuid) returns void`
  (`security definer`, mirrors `is_admin()`'s pattern); also implements the
  atomic guarded increment for `drops.units_sold` the Milestone 1 schema
  comment deferred here (`public.increment_drop_units_sold(drop_id uuid,
  qty integer) returns boolean` - returns false without raising if it would
  exceed `quantity_limit`, since a sold-out drop is an expected state, not
  an error).
- **Test:** integration - reserving more than available stock raises and
  leaves `quantity_on_hand` unchanged for every snack in the attempted
  cart (no partial reservation); reserving exactly available stock
  succeeds; releasing restores the exact held quantities.

### Task 2 — `POST /api/checkout/session`
- Resolves the caller's cart (reuses `resolveExistingCartId`/`getCartContents`
  from Milestone 5 - no cart-resolution logic duplicated a third time),
  rejects an empty cart with `400`, calls
  `reserve_inventory_for_cart`, then builds a Stripe Checkout Session:
  one-time boxes/snacks as `mode: 'payment'` line items at their current
  `price_cents`; a subscription box as `mode: 'subscription'` with a Price
  looked up/created from the box's current `price_cents` (Product Decision
  #1). Guest checkout requires an email field in the request body when no
  bearer token is present (Product Decision #6).
- Session `metadata` carries `cart_id` and (if authenticated) `user_id`,
  so the webhook never has to trust anything client-supplied to figure out
  whose order this is.
- **Test:** integration - creates a session for a mixed cart with correct
  line items and total; rejects an empty cart; rejects when reservation
  fails (simulate insufficient stock), leaving the cart and inventory
  untouched.

### Task 3 — `src/app/api/webhooks/stripe/route.ts`
- Verifies the Stripe signature before any processing (CLAUDE.md payments
  rule). Checks `stripe_events` for the event id first (`insert ... on
  conflict do nothing`; zero rows affected = already processed, return 200
  immediately - idempotency per CLAUDE.md).
- `checkout.session.completed`: creates `orders` (+ `order_items` +
  `order_item_snacks` copied from the cart's lines), marks the cart
  `status = 'converted'`, creates a `subscriptions` row if the session was
  subscription-mode, credits `rewards_ledger` + `profiles.rewards_points`
  in the same transaction for authenticated orders only (Product Decision
  #7), sends the confirmation email (Task 4).
- `checkout.session.expired`: calls `release_inventory_for_order`
  equivalent for the reservation tied to that session's cart, cart stays
  `active` (not converted) so the customer can retry.
- **Test:** integration - the same event id processed twice creates
  exactly one order and credits rewards exactly once; an expired session
  releases the exact held inventory; a request with an invalid/missing
  Stripe signature is rejected before any DB write.

### Task 4 — Order confirmation email (Resend)
- Sent from the webhook handler after a successful `checkout.session.completed`
  order creation, guest or authenticated. Plain, factual content: order
  number, line items, total, shipping address if provided.
- **Test:** integration - email send is invoked with the correct
  recipient/order data (Resend call itself mocked/captured, not actually
  sent in tests - webhook processing must stay fast and side-effect-free
  for retries).

### Task 5 — Cart → Checkout UI
- A "Checkout" button on the Milestone 5 cart page, disabled when empty
  (already the case), posts to `/api/checkout/session`, redirects the
  browser to the returned Stripe-hosted Checkout URL. Guest checkout
  prompts for an email first if no session exists.
- **Test:** E2E - using Stripe's test-mode card (4242 4242 4242 4242)
  against a real Stripe test-mode Checkout Session (not mocked - same "no
  mocking, hit the real dependency" convention already established for
  Supabase integration tests), completing checkout lands back on an order
  confirmation page.

### Task 6 — Final integration pass
- `npm run typecheck && npm run lint && npm run test`, full Playwright
  suite. Requires `STRIPE_WEBHOOK_SECRET` from the Stripe CLI
  (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`) for
  local webhook testing - walked through step by step when we reach this
  task.

---

## Completion Criteria (mirrors roadmap)

- [ ] E2E: Stripe test-card purchase → webhook fires → order + order_items
      rows created correctly → inventory decremented → confirmation email
      sent (captured in test mode)
- [ ] Duplicate webhook delivery (same event id sent twice) does not
      double-create the order or double-credit rewards
- [ ] A Checkout session that expires without payment releases its
      inventory hold

## Explicitly out of scope (later milestones' job)

- Subscription cancellation/pause UI (Milestone 7)
- Rewards *redemption* at checkout, referral crediting, promo codes
  (Milestone 9)
- Admin order fulfillment / tracking numbers (Milestone 8)
