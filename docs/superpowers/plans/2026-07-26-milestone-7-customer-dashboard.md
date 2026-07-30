# Milestone 7: Customer Dashboard — Implementation Plan

**Date:** 2026-07-26
**Status:** Draft — pending Ted's review before implementation begins
**Branch:** `milestone-7-customer-dashboard`
**Depends on:** Milestone 6 (orders must exist), Milestone 2 (accounts)

Gives a logged-in customer a home base: order history/detail, subscription
pause/cancel via Stripe's hosted Customer Portal, profile/preferences
editing, rewards balance/history (read-only), and a shareable referral
link. Per the roadmap, admin-side order fulfillment (Milestone 8) and
rewards redemption + referral crediting logic (Milestone 9) are explicitly
out of scope here — this milestone builds the customer-facing *read*
surfaces and the one *write* surface (preferences) that doesn't depend on
later milestones.

---

## Ground truth already in place (verified against the actual migrations,
## not assumed)

- `profiles.referral_code` is generated at signup (`default
  encode(extensions.gen_random_bytes(6), 'hex')`) but **nothing reads or
  acts on it yet** — no signup-flow referral capture exists
  (`src/app/api/auth/signup/route.ts` has zero references to "referr").
  Confirmed by direct search, not assumed. The `referrals` table exists
  and is RLS-protected (`referrals select own`: referrer, referred, or
  admin) but will be empty until Milestone 9 builds the capture-on-signup
  path. **Product Decision #1 below makes this an explicit, accepted gap
  for this milestone,** not a bug to chase.
- `customer_preferences` (1:1 with `profiles` via `user_id`, RLS
  `auth.uid() = user_id or is_admin()`): `dietary_restrictions text[]`,
  `disliked_categories text[]`, `flavor_profile text[]`, `spice_tolerance
  text`, `marketing_opt_in boolean`. All nullable/array-default, so an
  edit form can safely default to empty/false without a migration.
- `customer_addresses` exists separately from `customer_preferences`
  (recipient_name, line1/2, city, state, postal_code, country,
  is_default, soft-deletable via `deleted_at`) — profile editing in this
  milestone should include address management, not just the preferences
  table, since that's the only place a customer's shipping addresses live.
- `orders`: `status` (`pending/paid/fulfilled/shipped/cancelled/refunded`),
  `tracking_number text` (nullable), `shipping_address jsonb` (point-in-time
  snapshot, not FK-linked). Written server-side only, RLS is a
  defense-in-depth backstop — Milestone 7 only ever *reads* this table for
  a customer's own orders (`o.user_id = auth.uid()`); nothing here writes
  `status` or `tracking_number` (that's Milestone 8's admin job).
- `subscriptions`: `status` (`active/paused/cancelled/past_due`),
  `stripe_subscription_id`, `next_delivery_at`. RLS: customer can `select`
  own rows; only admin/service-role can write directly to this table.
  Since Product Decision #2 (below) routes pause/cancel through Stripe's
  Customer Portal, this milestone's own webhook handler (extending
  Milestone 6's `src/app/api/webhooks/stripe/route.ts`) must listen for
  `customer.subscription.updated`/`.deleted` to keep this table in sync
  with whatever the customer does inside the Portal — the Portal changes
  Stripe's state first, our DB is the mirror, same pattern as Milestone
  6's checkout webhook.
- `rewards_ledger`: append-only, source of truth for balance;
  `profiles.rewards_points` is a cached derived total, never written
  independently (per migration comment). This milestone only reads both —
  no redemption logic, no new writes.
- `referrals`: `referrer_id`, `referred_id`, `status`
  (`pending/credited`), `reward_issued_at`. Will render as an empty list
  under Product Decision #1 above until Milestone 9.

---

## Product Decisions

**1. Referral link UI ships now; signup-side capture and crediting logic
stay deferred to Milestone 9 — approved 2026-07-26.** This milestone
surfaces the existing `profiles.referral_code` as a copyable link
(`https://<domain>/signup?ref=<code>`) and a "friends referred" status
list sourced from the `referrals` table. That list will legitimately be
empty for every user until Milestone 9 adds the signup-side capture (`?ref=`
→ resolve referrer → insert `referrals` row) and the dual-sided credit
logic. This is a known, accepted gap — not a bug — consistent with the
roadmap's own milestone boundary (Milestone 9: "Referral dual-sided credit
on qualifying signup + first purchase").

**2. Subscription pause/cancel goes through Stripe's hosted Customer
Portal, not an in-app UI — approved 2026-07-26.** A "Manage Subscription"
button creates a Stripe Billing Portal session
(`stripe.billingPortal.sessions.create`) scoped to the customer's
`stripe_customer_id` and redirects there. Requires configuring the Portal
in the Stripe Dashboard (Products/Prices that are portal-editable,
allowed actions — pause, cancel, update payment method — and the return
URL back to `/account/subscriptions`). Ted has not yet configured this;
walked through step-by-step as part of Task 2 below. Our `subscriptions`
table is kept in sync via new webhook handling for
`customer.subscription.updated` and `customer.subscription.deleted`,
extending (not replacing) Milestone 6's existing webhook route.

**3. Order tracking is read-only display in this milestone — approved
2026-07-26.** The order detail page shows `orders.status` and
`orders.tracking_number` exactly as currently stored. Nothing in this
milestone writes to either field; that write path (marking an order
fulfilled, entering a tracking number) is explicitly Milestone 8's job
per the roadmap. Until Milestone 8 ships, every order will show
`status = 'paid'` (or whatever the checkout webhook sets) with a null
tracking number — expected, not a bug.

**4. Rewards balance/history is read-only in this milestone — approved
2026-07-26.** Displays `profiles.rewards_points` (cached balance) and the
full `rewards_ledger` history for the logged-in user (reason, delta,
date, linked order if any). No redemption UI, no point-spending logic —
that's Milestone 9's job per the roadmap.

**5. Profile editing covers both `customer_preferences` and
`customer_addresses` — approved 2026-07-26.** The roadmap only names
`customer_preferences`, but a "profile & preferences" page that can't
manage shipping addresses would be incomplete for a real customer — orders
already snapshot `shipping_address` from this table at checkout
(Milestone 6). Scope: create/edit/delete addresses, set one as default;
edit dietary restrictions, disliked categories, flavor profile, spice
tolerance, and marketing opt-in.

---

## Tasks

### Task 1 — `(account)` route group scaffold + data-access layer
- New route group `src/app/(account)/account/*`: `/account` (dashboard
  landing), `/account/orders`, `/account/orders/[id]`,
  `/account/subscriptions`, `/account/preferences`, `/account/rewards`,
  `/account/referrals`. All require an authenticated session
  (middleware/`proxy.ts` pattern already established in Milestone 2);
  unauthenticated visitors redirect to `/login`.
- Query functions in `src/lib/supabase/queries/account.ts`:
  `getOrdersForUser`, `getOrderDetail(orderId)` (ownership-checked, not
  just RLS-trusted — return 404 not 403 on mismatch, matching Milestone
  5's established cart-ownership pattern), `getSubscriptionsForUser`,
  `getPreferences`, `getAddresses`, `getRewardsLedger`,
  `getReferralsForUser`.
- **Test:** integration — each query returns only the authenticated
  user's own rows; a cross-user request for another user's order detail
  returns 404, not another user's data (mirrors Milestone 5's
  `rls-cross-user.test.ts` pattern).

### Task 2 — Subscription management via Stripe Customer Portal
- Stripe Dashboard configuration (walked through step-by-step with Ted):
  enable Customer Portal, set editable products/prices, allowed actions
  (cancel, pause collection, update payment method), default return URL.
- `POST /api/account/subscriptions/portal-session`: creates a Billing
  Portal session for `auth.uid()`'s `stripe_customer_id`, returns the
  portal URL.
- Extend `src/app/api/webhooks/stripe/route.ts` (Milestone 6's handler,
  same idempotency ledger via `stripe_events`) with
  `customer.subscription.updated` and `customer.subscription.deleted`
  cases: update `subscriptions.status`/`next_delivery_at` to match
  Stripe's state.
- `/account/subscriptions` page: lists the user's subscriptions with
  current status, next delivery date, and a "Manage Subscription" button
  that redirects to the Portal session URL.
- **Test:** integration — portal-session route rejects unauthenticated
  requests and requests for a user with no `stripe_customer_id`;
  webhook test simulates `customer.subscription.updated`/`.deleted` and
  confirms the local `subscriptions` row is updated correctly and
  idempotently on redelivery (same idempotency pattern as Milestone 6).

### Task 3 — Order history & detail (read-only)
- `/account/orders`: list of the user's orders (status, date, total,
  item count), most recent first.
- `/account/orders/[id]`: full detail — line items (box/snack, quantity,
  price), status, tracking number if present, shipping address snapshot.
- **Test:** integration — order list only shows the authenticated user's
  orders; detail page 404s on another user's order id.

### Task 4 — Profile & preferences editing
- `/account/preferences`: form for `customer_preferences` fields
  (dietary restrictions, disliked categories, flavor profile, spice
  tolerance, marketing opt-in) — `PATCH /api/account/preferences`.
- Address management on the same page or a sub-route: list/add/edit/soft-
  delete `customer_addresses`, set one as default — `POST`/`PATCH`/`DELETE
  /api/account/addresses[/:id]`.
- **Test:** integration — preferences update persists and round-trips
  correctly; setting a new address as default un-defaults the previous
  one; soft-deleting an address sets `deleted_at` and excludes it from
  the active list without hard-deleting the row (orders keep their
  historical snapshot regardless, per the schema comment).

### Task 5 — Rewards balance & history (read-only)
- `/account/rewards`: current `profiles.rewards_points` balance at the
  top, full `rewards_ledger` history below (date, reason, delta, linked
  order link if `order_id` is set).
- **Test:** integration — ledger list matches exactly what Milestone 6's
  webhook credited for a test order; balance shown matches the cached
  `profiles.rewards_points` value.

### Task 6 — Referral link & status (empty-state accepted)
- `/account/referrals`: displays `https://<domain>/signup?ref=<code>`
  with a copy-to-clipboard button, and a "Friends you've referred" list
  from the `referrals` table (will be empty for every user until
  Milestone 9 — Product Decision #1).
- **Test:** integration — the referral link is correctly built from the
  user's actual `referral_code`; the referrals list query returns the
  correct (currently empty) result for a user with no referrals, and
  correctly scoped rows if any exist (seeded in the test only).

### Task 7 — Final integration pass
- `npm run typecheck && npm run lint && npm run test`, full Playwright
  suite covering: login → view order → view/manage subscription (mocked
  Portal redirect, not a live Stripe Portal session in CI) → edit
  preferences → view rewards → copy referral link.

---

## Completion Criteria (mirrors roadmap)

- [ ] A logged-in customer sees only their own orders (RLS-verified, not
      just UI-filtered)
- [ ] Canceling/pausing a subscription via the Stripe Customer Portal is
      reflected in the local `subscriptions` table and the UI after the
      webhook fires (idempotent on redelivery)
- [ ] Preferences and addresses save and persist across sessions
- [ ] Each user's referral link is unique (derived from their actual
      `referral_code`) and copies correctly

## Explicitly out of scope (later milestones' job)

- Signup-side referral capture and dual-sided crediting (Milestone 9)
- Rewards redemption at checkout (Milestone 9)
- Admin-side order fulfillment / tracking number entry (Milestone 8)
- Promo codes (Milestone 9)
