# Milestone 9: Rewards & Referrals — Implementation Plan

**Branch:** `milestone-9-rewards-referrals`
**Depends on:** Milestone 6 (checkout/orders/webhook), Milestone 7 (referral link/status UI already built, currently empty), Milestone 8 (promotions admin CRUD, rewards ledger admin)

## Ground Truth (verified against actual code, not assumed)

- `profiles.referral_code` is auto-generated at signup (column default
  `encode(extensions.gen_random_bytes(6), 'hex')`) - already works, nothing
  to build there.
- `profiles.referred_by` exists but **is never written anywhere** -
  confirmed via grep across the whole `src/` tree. `handle_new_user()`
  (the `auth.users` insert trigger) only writes `id, email` - no referral
  logic at all.
- `public.referrals` table exists (`referrer_id, referred_id, status
  check in ('pending','credited'), reward_issued_at, created_at`, plus a
  `referrals_no_self_referral check (referrer_id <> referred_id)`
  constraint) but **has zero rows in the live DB** - nothing has ever
  inserted into it. Milestone 8's Operations Dashboard and admin Referrals
  page were both built already expecting this table to eventually have
  data; they need no changes.
- `src/app/(account)/account/referrals/page.tsx` (Milestone 7) already
  renders the referral link as `${appUrl}/signup?ref=${referralCode}` and
  a status list via `getReferralsForUser`/`getReferralCode` - this UI
  **will just work** once real `referrals` rows exist. No UI changes
  needed on the account side.
- `/signup` (`src/app/(auth)/signup/page.tsx`) is a client component
  calling `supabase.auth.signUp({ email, password })` with no `options`
  at all - doesn't read any query param, doesn't pass any metadata.
- `public.credit_rewards_points(p_user_id, p_delta_points, p_reason,
  p_order_id)` (Milestone 6) is directly reusable for referral crediting
  with new `p_reason` values - no new crediting RPC needed for the earn
  side.
- `public.increment_drop_units_sold(p_drop_id, p_qty)` (Milestone 6) is
  the established pattern for an atomic guarded counter increment
  (`update ... where count + delta <= limit`, returns boolean, doesn't
  raise on "would exceed"). `promotions.used_count` needs the exact same
  treatment - deferred here explicitly by Milestone 1's and Milestone 8's
  own schema/plan comments.
- Checkout session creation (`src/app/api/checkout/session/route.ts`)
  builds every Stripe line item inline via `price_data` (never a
  persisted Stripe Price/Coupon object) and has no discount mechanism at
  all today.
- `customer_activity`'s event_type check constraint already includes
  `'reward_redeemed'` and `'referral_sent'` (Milestone 1 schema) - neither
  has ever been written. This milestone wires `reward_redeemed`.
  `referral_sent` would require an actual send mechanism (email/SMS
  invite) that doesn't exist and isn't in this milestone's scope (the
  existing UI is copy-link only) - left unwired, noted as an explicit gap
  for a future milestone, not silently ignored.
- Rewards redemption is single-user-scoped (no cross-customer contention
  the way physical inventory has), so unlike `reserve_inventory_for_cart`
  it does **not** need a hold-at-session-creation / release-on-expiry
  flow - a guarded atomic debit at webhook confirmation time is
  sufficient and much simpler.
- Promotion `used_count` is a simple counter-against-a-limit problem, not
  a physically scarce resource either - same reasoning, no reservation
  needed. Guarded increment at webhook confirmation only.

## Product Decisions (confirmed 2026-07-31)

1. **Referral reward: 500 points each side** (referrer and the new
   customer), credited on the new customer's qualifying first purchase.
2. **Redemption rate: 100 points = $1 off** (1 point = 1 cent exactly -
   no rounding anywhere in the discount math). Consistent with the
   existing 1-point-per-dollar-spent earn rate (Milestone 6, Decision
   #9) - a clean 1% loyalty rate.
3. **Promo codes and rewards redemption can stack** in the same
   checkout - both discounts sum into a single Stripe coupon amount.

## Additional engineering decisions (not business-facing, made directly)

- **Discount delivery:** a Stripe Coupon is created on the fly per
  checkout session (`stripe.coupons.create({ amount_off, currency: "usd",
  duration: "once" })`) for the combined promo + redemption discount, and
  attached via `discounts: [{ coupon: coupon.id }]`. `duration: "once"`
  is deliberate: it discounts only the first invoice of a subscription
  checkout, never recurring renewals - "applied at checkout" should not
  silently become a permanent recurring discount.
- **Promo/redemption side effects (used_count increment, points debit,
  referral credit) all happen inside the webhook, on first delivery
  only** - mirrors `order_placed` customer_activity logging's existing
  idempotency gate (inside the `!existingOrder` branch, never on
  redelivery). Validated again (not just at session creation) before
  committing, since a promo could theoretically hit its limit or expire
  in the window between session creation and payment confirmation.
- **Referral abuse guard beyond the DB's own `referrer_id <>
  referred_id` constraint:** before crediting, skip (leave the referral
  row `pending`, no error, no credit) if both accounts share a non-null
  `stripe_customer_id` - the roadmap's "same `stripe_customer_id`" cap
  on the self-referral-via-second-account pattern. Silent skip rather
  than an error, since this fires deep inside webhook processing where
  raising would incorrectly fail an otherwise-legitimate order.
- **Guest checkouts never redeem points or trigger referral credit** -
  same scope restriction Milestone 6 already applied to rewards earning
  for guests (Decision #7/#9), applied consistently here.

## Tasks

### Task 1 — Migration: referral capture trigger + guarded RPCs
- Replace `handle_new_user()`: read
  `new.raw_user_meta_data->>'referral_code'`; if a `profiles` row with
  that `referral_code` exists and its `id <> new.id`, set
  `referred_by` on the new profile row at INSERT time (bypasses the
  existing `profiles_prevent_privilege_escalation` trigger, which only
  fires on UPDATE) and insert a `referrals` row
  (`referrer_id, referred_id, status: 'pending'`) in the same function
  call. An invalid/missing/self-referencing code is a no-op, not an
  error - signup must never fail because of a bad `?ref=` value.
- `public.increment_promotion_used_count(p_promotion_id uuid) returns
  boolean` - guarded increment mirroring `increment_drop_units_sold`
  exactly: `update ... set used_count = used_count + 1 where id =
  p_promotion_id and (usage_limit is null or used_count < usage_limit)
  and (expires_at is null or expires_at > now())`, returns
  `row_count > 0`.
- `public.redeem_rewards_points(p_user_id uuid, p_points integer,
  p_order_id uuid) returns boolean` - guarded debit: only writes a
  negative `rewards_ledger` row (`delta_points: -p_points, reason:
  'redemption'`) and decrements `profiles.rewards_points` if the current
  balance is `>= p_points`; returns false without writing anything
  otherwise. Same atomic single-statement-pair shape as
  `credit_rewards_points`.
- **Test:** integration - signup with a valid `?ref=` code sets
  `referred_by` and creates a `pending` referral; signup with no/garbage
  code creates neither and does not fail; `increment_promotion_used_count`
  rejects at the limit and after `expires_at`; `redeem_rewards_points`
  rejects an over-balance redemption and leaves the ledger/balance
  untouched.

### Task 2 — Signup referral capture
- `src/app/(auth)/signup/page.tsx`: read `?ref=` via
  `useSearchParams()`, pass `options: { data: { referral_code: ref } }`
  to `supabase.auth.signUp(...)` when present.
- **Test:** covered by Task 1's integration test (the trigger is what
  actually matters); no separate UI test needed beyond confirming the
  param is read and forwarded.

### Task 3 — Promo code + rewards redemption at checkout
- `src/lib/validations/checkout.ts`: add `promoCode?: string` and
  `redeemPoints?: z.number().int().positive().optional()` to
  `createCheckoutSessionSchema`.
- `src/app/api/checkout/session/route.ts`: if `promoCode` given, look it
  up (`code` match, not expired, `used_count < usage_limit` or no
  limit) - 400 if invalid; if `redeemPoints` given, require
  authenticated (400 for guests) and `profiles.rewards_points >=
  redeemPoints` - 400 otherwise. Compute `discountCents = (promo cents
  off, computed from `discount_type`/`value` against the cart subtotal)
  + redeemPoints`. If `discountCents > 0`, create a Stripe coupon and
  attach via `discounts`. Store `promotion_id`/`redeemed_points` in
  `session.metadata` (both optional) for the webhook to read.
- **Test:** integration - valid promo code reduces `amount_total`
  correctly for both `percent` and `fixed` types; expired/over-limit
  promo rejected 400 with no Stripe call side effects; `redeemPoints`
  over balance rejected 400; guest attempting `redeemPoints` rejected
  400; stacked promo + redemption combine correctly in one coupon.

### Task 4 — Webhook: commit promo/redemption/referral crediting
- `handleCheckoutSessionCompleted` → `createOrderFromSession`: after
  order creation, inside the same "first delivery only" scope already
  used for rewards/activity logging:
  - if `session.metadata.promotion_id` present, call
    `increment_promotion_used_count` (log, don't fail the order, if it
    somehow returns false at this point - the payment already succeeded).
  - if `session.metadata.redeemed_points` present, call
    `redeem_rewards_points`; on success, insert `customer_activity`
    (`reward_redeemed`).
  - referral crediting: if `userId` set and
    `profiles.referred_by` is set and a `pending` `referrals` row exists
    for `referred_id = userId`, and referrer/referred don't share a
    non-null `stripe_customer_id` (abuse guard) - credit both sides via
    `credit_rewards_points` (`p_reason: 'referral_referrer_credit'` /
    `'referral_referred_credit'`, `p_order_id: order.id` for the
    referred side, `p_order_id: null` for the referrer side since it
    isn't their order), then update the `referrals` row to
    `status: 'credited', reward_issued_at: now()`.
- **Test:** integration - promo `used_count` increments exactly once
  (not on redelivery); redeemed points debit exactly once and are
  reflected in `profiles.rewards_points`; a referred user's first paid
  order credits both referrer and referred exactly 500 points each and
  flips the referral to `credited`; a second order from the same
  referred user does not credit again; shared-`stripe_customer_id` case
  is silently skipped (no credit, row stays `pending`, no error).

### Task 5 — Checkout UI: promo code + rewards redemption
- Cart page (`src/app/(shop)/shop/cart/page.tsx`) or a dedicated
  checkout step: promo code text input, and (authenticated only) a
  "redeem points" control showing available balance and a points-to-
  redeem input, both wired into the existing `POST /api/checkout/session`
  call.
- **Test:** none new beyond Task 3's route-level coverage - this is a
  thin form over an already-tested endpoint, same precedent as every
  other admin form in Milestone 8.

### Task 6 — Final integration pass
- `npm run typecheck && npm run lint && npm run test`.
- Playwright e2e: sign up via a referral link → complete a purchase →
  confirm both the new customer's and the referrer's rewards balances
  increased by 500 and the account Referrals page shows "Credited" →
  separately, apply a promo code and redeem points on a normal checkout
  and confirm the discounted total charged.

---

## Completion Criteria (mirrors roadmap)

- [ ] Refer a friend → friend signs up and completes a purchase → both
      accounts credited exactly once
- [ ] A self-referral attempt (same account, or a second account sharing
      the same `stripe_customer_id`) is rejected/skipped, never credited
- [ ] A promo code stops applying once `usage_limit` or `expires_at` is
      hit
- [ ] Rewards points redeem correctly at checkout and cannot be redeemed
      past the customer's actual balance
- [ ] `npm run typecheck && npm run lint && npm run test` all pass

## Explicitly out of scope

- `referral_sent` customer_activity event (no send/invite mechanism
  exists to log)
- Any inventory-style hold/release for promo usage or points redemption
  (not needed - see engineering decisions above)
- Changing the referral reward amount or redemption rate dynamically
  (flat constants for V1, matching every other hardcoded V1 policy
  value in this codebase, e.g. `LOW_STOCK_THRESHOLD`,
  `POINTS_PER_DOLLAR`)
