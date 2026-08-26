# Milestone 13: Cart, Build-a-Box & Native Checkout — Implementation Plan

**Date written:** 2026-08-09
**Status:** Retroactive. The mobile roadmap (`2026-08-06-mobile-v1-milestone-roadmap.md`)
states this plan should exist *before* implementation begins, mirroring how
`2026-07-20-milestone-6-checkout.md` was written for web. That didn't happen
here - the branch's cart/checkout/webhook code was already written and
committed before this document existed. This is a deviation from the
project's own stated process, flagged here rather than silently glossed
over, per `PROJECT_CONSTITUTION.md` §0's instruction not to let drift go
unflagged. What follows documents what was actually built, task-by-task,
against the roadmap's stated feature list and completion criteria - not a
plan that was approved in advance.
**Branch:** `mobile-milestone-13-checkout`
**Depends on:** Milestone 12 (catalog data to build a cart from), Milestone 11
(auth, mobile API client, design system)

Turns the mobile app's catalog browsing into a working purchase: cart,
Build-a-Box, native Stripe Payment Sheet checkout, and order confirmation.
Per the roadmap, this is mobile's highest-risk milestone (payments, webhooks,
money) - same caveat web's Milestone 6 carried.

---

## Ground truth already in place (verified against the actual code, not assumed)

- Web's cart/checkout foundation (`resolveCartId`/`resolveExistingCartId`,
  `getCartContents`, `calculateCartTotal`, the Stripe webhook's
  `checkout.session.completed` handling, guest-checkout schema) already
  existed from Milestones 2, 5, 6, 9 and is reused as-is, not reimplemented,
  per this repo's own established pattern for mobile milestones (Milestone
  12's read-routes decision set that precedent).
- `X-Anonymous-Cart-Id` (mobile's SecureStore-based equivalent of the web
  cookie) and the `authenticatedFetch`/bearer-token pattern already existed
  from Milestone 11 - this milestone is the first to actually exercise both
  against real money-adjacent endpoints.
- `orders.stripe_payment_intent_id` and `orders.stripe_checkout_session_id`
  are both `unique`, nullable columns (`20260710220202_initial_schema.sql`) -
  this milestone's PaymentIntent-based order path uses the first and leaves
  the second `null`, the inverse of every existing web order.
- `mobile/.env.example` documents, as of 2026-08-09, that the Stripe key
  configured for this project is **live-mode with no test-mode key
  available**. This constrains what "done" can mean for this milestone until
  that changes - see Completion Criteria below.

---

## Product Decisions

**1. Native Payment Sheet checkout is one-time-purchase-only for V1 - approved
by Ted, 2026-08-09.** A cart containing a subscription box is rejected by
`POST /api/checkout/payment-intent` with a clear error; `CheckoutScreen`
detects this client-side (`cart.lines.some(isSubscription)`) and routes that
case to the *existing*, already-working web checkout flow instead
(`POST /api/checkout/session`, opened in an in-app browser tab via
`expo-web-browser`). Reasoning: Stripe subscriptions don't have a simple
PaymentIntent the way one-time payments do (it's nested under
`subscription.latest_invoice.payment_intent`, a materially bigger
integration) - not worth rushing into the same milestone as the first native
payments work, on a live-only Stripe key with no way to verify safely yet.

**2. `payment_intent.succeeded` webhook processing is gated on
`metadata.source === "mobile"`.** Every Checkout-Session-created
PaymentIntent (i.e. every existing web order) *also* independently fires its
own `payment_intent.succeeded` event - Stripe does not suppress it because a
`checkout.session.completed` event already covered that same payment.
Without this guard, shipping this milestone would have double-processed
every web order the moment it went live. `metadata.source` is set to
`"mobile"` only by `/api/checkout/payment-intent/route.ts`; web's Checkout
Session route never sets that key, so this is a safe, exclusive
discriminator.

**3. Order confirmation trusts the PaymentIntent id itself, not a login
session.** `GET /api/orders/by-payment-intent/[id]` has no auth check -
mirrors `(shop)/shop/checkout/success/page.tsx`'s own established security
model exactly, where a Stripe-generated `session_id` is the access
credential without a login check. Both ids are long, random, and returned
only to the customer who made the payment; this is also what lets a mobile
*guest* checkout (no account, no bearer token at all) see their own order
confirmation. The `checkout` rate-limit tier (30/min/IP), not the more
generous `catalog` tier, is used specifically because this endpoint has no
auth gate.

**4. Anonymous cart → account cart merge policy: combine, never discard -
approved by Ted, 2026-08-09.** Discovered mid-milestone, not originally
scoped: the roadmap promised the anonymous cart id would be "synced to
user_id post-auth," but that sync never actually existed for web *or*
mobile - a guest's cart was silently orphaned on login/signup. Fixed as
Task 7 below. If the account has no cart yet, the anonymous cart is promoted
in place; if it already has one, every `cart_items` row from the anonymous
cart is reparented onto it (not summed into any "matching" line - nothing
else in this codebase auto-consolidates duplicate cart lines either) and the
anonymous cart is marked `abandoned`.

---

## Tasks

### Task 1 — Mobile-facing read routes (closing Milestone 12's remaining gap)
- `GET /api/cart` (`src/app/api/cart/route.ts`): wraps the existing
  `getCartContents()` web already uses, via `resolveExistingCartId` (does
  not create a cart as a side effect of reading one).
- `GET /api/catalog/byo-snacks` (`src/app/api/catalog/byo-snacks/route.ts`):
  wraps `getByoEligibleSnacks()`, mirrors the web BYO picker's own query.
- **Test:** `tests/integration/cart-route.test.ts`,
  `tests/integration/catalog-byo-snacks-route.test.ts`. Written, typecheck-
  verified, **not yet executed** (see Completion Criteria).

### Task 2 — Cart and Build-a-Box screens
- `mobile/src/lib/api/cart.ts`: `cartFetch()` wrapper (attaches
  `X-Anonymous-Cart-Id` from SecureStore), `fetchCart`, `addBoxToCart`,
  `addSnackToCart`, `addBuildABoxToCart`, `updateCartItemQuantity`,
  `removeCartItem`.
- `mobile/src/screens/shop/BuildABoxScreen.tsx`: slot-size picker → snack
  grid, mirrors `build-a-box-picker.tsx`'s web flow (pick size, pick exactly
  that many BYO-eligible snacks, submit). Wired into `ShopStack` and
  reachable from both `CartScreen` and `BoxDetailScreen`.
- **Test:** covered indirectly via `cart-route.test.ts` and the cart-items
  route's existing `cart-items-route.test.ts`; no dedicated Build-a-Box
  mobile-screen test (React Native component testing wasn't set up for this
  milestone - out of scope, see below).

### Task 3 — `POST /api/checkout/payment-intent`
- `src/app/api/checkout/payment-intent/route.ts`: mirrors
  `/api/checkout/session/route.ts`'s validation/reservation/promo/points
  logic exactly, but creates a Stripe `PaymentIntent` directly (with
  `shippingAddress` from the request body, since there's no hosted page to
  collect it) instead of a Checkout Session. Rejects subscription-containing
  carts (Product Decision #1).
- `src/lib/validations/checkout.ts`: `shippingAddressSchema`,
  `createPaymentIntentSchema`.
- **Test:** `tests/integration/checkout-payment-intent-route.test.ts`.
  Written, typecheck-verified, **not yet executed**.

### Task 4 — `CheckoutScreen`
- `mobile/src/screens/checkout/CheckoutScreen.tsx`: branches on
  `cart.lines.some(isSubscription)` - one-time carts get an in-app shipping
  address form + native Payment Sheet (`@stripe/stripe-react-native`);
  subscription-containing carts get a "Continue to secure checkout" button
  that opens the web flow in `expo-web-browser`.
- `mobile/src/lib/api/checkout.ts`: `createPaymentIntent`,
  `createCheckoutSession`.
- On a successful Payment Sheet confirmation, navigates to
  `OrderConfirmation` (Task 6) rather than assuming the order already exists.
- **Test:** no mobile-screen-level test (same React Native testing gap as
  Task 2); the routes it calls are covered by Tasks 3/5/6's tests.

### Task 5 — `payment_intent.succeeded` webhook handler
- `src/app/api/webhooks/stripe/route.ts`: `handlePaymentIntentSucceeded` +
  `createOrderFromPaymentIntent`, gated on `metadata.source === "mobile"`
  (Product Decision #2). Idempotency anchored on
  `orders.stripe_payment_intent_id` (unique), same pattern as the existing
  `checkout.session.completed` handler's `stripe_checkout_session_id` anchor.
  Creates `order_items`/`order_item_snacks`, credits rewards, applies
  promo/points, credits referrals - a deliberate line-for-line mirror of
  `createOrderFromSession`'s tail logic, not a shared refactor (see that
  function's own header comment for why: a live, revenue-critical path with
  no test-mode key to verify against, so the existing working web code was
  left untouched).
- **Test:** `tests/integration/payment-intent-webhook.test.ts`. Written,
  typecheck-verified, **not yet executed**.

### Task 6 — Order confirmation
- `src/lib/supabase/queries/orders.ts`: `getOrderByPaymentIntentId` (no
  ownership check - Product Decision #3).
- `src/app/api/orders/by-payment-intent/[paymentIntentId]/route.ts`.
- `mobile/src/screens/checkout/OrderConfirmationScreen.tsx`: polls the route
  above (5s interval, capped at 12 attempts) until the webhook-created order
  is visible, then shows line items and total.
- **Test:** `tests/integration/orders-by-payment-intent-route.test.ts`.
  Written, typecheck-verified, **not yet executed**.

### Task 7 — Anonymous cart → account cart merge (Product Decision #4)
- `src/lib/cart/resolve-cart.ts`: `mergeAnonymousCartIntoUserCart`, called
  from `resolveCartId`, `resolveExistingCartId`, and the web cart page's
  `resolveCartIdForPage` - fires automatically on the first authenticated
  cart-touching request that still carries an anonymous id, no caller has to
  trigger it separately.
- **Test:** `tests/integration/cart-merge.test.ts` covers the two
  Route-Handler-reachable paths (promote-in-place, combine-with-existing,
  no-op with no anonymous id, no-op for a stale id). Written, typecheck-
  verified, **not yet executed**. `resolveCartIdForPage`'s copy of the same
  logic has no automated test - it requires Next's request-scoped
  `next/headers` context, which the existing codebase already treats as
  untestable via the Route Handler test harness (see that function's own
  pre-existing header comment).

### Task 8 — Final integration pass *(not yet done)*
- `npm run typecheck && npm run lint && npm run test` full run.
- Requires a Stripe **test-mode** key swapped into `STRIPE_SECRET_KEY` /
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` first - running the integration suite
  against the current live-mode key would create real (uncharged, but not
  test-mode) PaymentIntent/Checkout Session objects in the live Stripe
  dashboard.
- A real device/simulator pass confirming Apple Pay and Google Pay
  (roadmap completion criterion, card-entry-only is not sufficient).

---

## Completion Criteria (mirrors roadmap)

- [ ] A mixed cart (1 box + 2 loose snacks + 1 BYO box) totals correctly,
      matching the web cart's total for an identical cart - subtotal math is
      asserted in `checkout-payment-intent-route.test.ts`, but the test
      itself hasn't been run.
- [ ] A completed native Payment Sheet purchase produces the exact same
      `orders`/`order_items`/`order_item_snacks` rows a web purchase would,
      verified by inspecting the DB after a real test-mode purchase - **not
      verified**; no test-mode Stripe key available yet, no device run
      performed.
- [ ] Apple Pay and Google Pay both work in their respective platform's
      sandbox/test mode, not just card entry - **not verified**; requires a
      physical/simulator device pass, not something a Route Handler
      integration test can cover regardless of Stripe key mode.
- [ ] Duplicate webhook delivery still doesn't double-create an order or
      double-credit rewards - test written
      (`payment-intent-webhook.test.ts`), **not yet run**.

None of the four roadmap completion criteria for this milestone are
currently checked off. The code and tests exist; execution and device
verification are the remaining work, blocked on a Stripe test-mode key per
Task 8.

## Explicitly out of scope (later milestones' job, or deferred within this one)

- Subscription purchases through the native Payment Sheet (Product Decision
  #1) - web checkout fallback stands in for V1.
- Push notifications, order history/tracking screens (Milestone 14).
- React Native component/screen-level tests for `BuildABoxScreen` and
  `CheckoutScreen` - this milestone has Route Handler/webhook integration
  coverage only; no RN testing library was set up as part of this work.
- App Store Connect/Play Console payment entitlement configuration
  (Milestone 15).
