# Milestone 14: Account, Rewards, Referrals & Push Notifications — Implementation Plan

**Date:** 2026-08-09
**Status:** Draft — pending Ted's review before implementation begins (this
time written *before* code, per the roadmap's own stated process - see
Milestone 13's plan doc for why that one was retroactive instead)
**Branch:** `mobile-milestone-13-checkout` (stacked on the unmerged
milestone 13 work per Ted's 2026-08-09 decision, rather than a fresh
worktree off `main` - milestone 14 depends on 13's screens/navigation
existing, and 13 hasn't merged yet)
**Depends on:** Milestone 13 (orders must exist to have a fulfillment status
to notify about; `CheckoutScreen`/`OrderConfirmationScreen` exist as the
natural home for the permission-prompt trigger - see Product Decision #4),
Milestone 11 (auth, mobile API client, design system)

Gives the mobile app the same account "home base" web's Milestone 7 built -
order history/detail, subscription pause/cancel via Stripe's Customer
Portal, rewards balance/history, a shareable referral link - plus push
notification infrastructure with two triggers (a Drop going live, an order
shipping). Per the roadmap, admin-side work and rewards/referral *crediting
logic* are out of scope here; those already exist server-side (web
Milestones 8/9) and this milestone only adds mobile-reachable ways to read
and act on them.

---

## Ground truth already in place (verified against the actual code, not assumed)

- `src/lib/supabase/queries/account.ts` already has every query function
  this milestone needs: `getOrdersForUser`, `getOrderDetail` (ownership-
  checked in code, not just RLS-trusted - returns `null` for both "no such
  order" and "belongs to someone else," callers turn that into 404, never
  403), `getSubscriptionsForUser`, `getPreferences`, `getAddresses`,
  `getRewardsLedger`, `getRewardsBalance`, `getReferralsForUser`,
  `getReferralCode`. None of this needs to be written or changed - only
  wrapped in new Route Handlers.
- `src/app/api/account/` currently has **write-only** routes:
  `POST /api/account/addresses` (+ `[id]` for PATCH/DELETE),
  `PATCH /api/account/preferences`,
  `POST /api/account/subscriptions/portal-session`. All three already use
  `getAuthenticatedUser(request)` (bearer-token auth, the same
  mobile-readiness convention every cart/checkout route already follows) -
  confirmed by reading each file, not assumed. **No GET route exists for
  any of orders, order detail, subscriptions, preferences, addresses,
  rewards, or referrals** - this is the same gap shape Milestone 12 closed
  for catalog and Milestone 13 closed for cart (web reads these directly in
  Server Components; mobile has no equivalent).
- `POST /api/account/subscriptions/portal-session` already returns a plain
  `{ url }` - directly reusable from mobile via `expo-web-browser`, the
  exact same pattern Milestone 13's `CheckoutScreen` already established for
  the subscription-checkout web fallback. No new backend work needed for
  subscription pause/cancel itself.
- `mobile/src/navigation/AccountStack.tsx` already has a placeholder
  comment: `// Orders / Subscriptions / Preferences / Rewards / Referrals
  land here in Milestone 14.` `AccountScreen.tsx` is currently a Milestone
  11 scratch/test screen (a button that PATCHes preferences with an empty
  body just to prove the bearer-token round trip works) - this milestone
  replaces its body with a real dashboard, not a rewrite of the stack shell.
- **No scheduling infrastructure exists anywhere in this repo** - no
  `vercel.json`, no cron route, nothing. Detecting "a Drop just went live"
  requires building this from scratch (Task 9), not extending something
  that already runs on a timer.
- `PATCH /api/admin/orders/[id]/route.ts` (web admin, Milestone 8) is the
  exact, already-existing fulfillment-status-update path the roadmap points
  to for the order-shipped trigger - it already writes an `audit_logs` row
  after updating `orders.status`; this milestone adds a push send alongside
  that write (Task 8), not a new admin feature.
- `push_tokens` table does not exist yet - needs a new migration (Task 7).

---

## Product Decisions

**1. Drop-live polling cadence: every 1 minute - approved by Ted,
2026-08-09.** A new Vercel Cron job (`vercel.json`) hits a new
`GET /api/cron/drop-live-notifications` route every minute, checking for
drops whose `starts_at` has just passed and haven't been notified yet.
Closest achievable match to the roadmap's "the instant a drop goes live"
framing of this feature's whole reason for existing, at negligible cost for
this traffic level.

**2. Notification permission prompt fires after first order confirmation -
approved by Ted, 2026-08-09.** Triggered from `OrderConfirmationScreen`
(Milestone 13) once an order reaches `status: "ready"` - not on cold app
open, not on first cart add. Ties the ask to proven purchase intent and a
concrete, immediate payoff ("get notified when this ships") rather than an
abstract future benefit.

**3. Subscription pause/cancel reuses the existing web Customer Portal flow
via an in-app browser tab, not a native subscription-management UI.**
Directly mirrors Milestone 13's own precedent for the same problem
(subscription checkout falls back to a web flow opened via
`expo-web-browser`). `POST /api/account/subscriptions/portal-session`
needs zero changes - it's already bearer-token-authenticated and returns a
plain URL.

**4. Profile preferences and address management are explicitly OUT of
scope for this milestone**, unlike web's Milestone 7 (which added them
beyond the original roadmap wording). The mobile roadmap's own Milestone 14
feature list names orders, subscriptions, rewards, referrals, and push -
preferences/addresses aren't listed, and a customer can still manage both
from the web account pages after buying via the app. Keeping this
milestone's already-large scope (7 new read routes + full push
infrastructure) from growing further by default; easy to pull forward into
a later milestone if wanted.

**5. Push token registration is upserted on the token itself, and
explicitly deregistered on sign-out.** `push_tokens.expo_push_token` is the
primary key (a device's Expo token, not `user_id`) - if a second account
signs into the same physical device, the upsert reassigns that row's
`user_id` rather than accumulating stale duplicate rows. Deregistering on
sign-out (not just relying on the next sign-in's upsert to fix it) is the
safer default given CLAUDE.md's "protect customer data at every layer" -
otherwise a signed-out device keeps receiving another account's pushes
indefinitely, purely because no one happened to sign into it again.

**6. Expo push sends are authenticated with an Expo access token, not sent
anonymously.** Requires a new `EXPO_ACCESS_TOKEN` (server-only env var,
obtained from the Expo dashboard) attached to every call against Expo's
push API - prevents another party from spoofing push sends against this
project's Expo push credentials.

---

## Tasks

### Task 1 — Mobile-facing account/rewards/referrals read routes
- `GET /api/account/orders`, `GET /api/account/orders/[id]`,
  `GET /api/account/subscriptions`, `GET /api/account/rewards` (balance +
  ledger together), `GET /api/account/referrals` (code + status list) - all
  thin wrappers around the existing `queries/account.ts` functions, all
  authenticated via `getAuthenticatedUser` (bearer token only, same as the
  existing write routes in this directory).
- **Test:** integration - each route returns only the authenticated user's
  own data; `GET /api/account/orders/[id]` for another user's order id
  returns 404, not 403 or another user's data (mirrors the established
  `rls-cross-user.test.ts` pattern); unauthenticated requests to all five
  routes return 401.

### Task 2 — Account dashboard + navigation
- `mobile/src/screens/account/AccountScreen.tsx`: replaces the Milestone 11
  scratch content with a real dashboard - rewards balance summary, and
  navigation entries to Orders, Subscriptions, Rewards, Referrals.
- `mobile/src/navigation/AccountStack.tsx`: adds `Orders`, `OrderDetail`,
  `Subscriptions`, `Rewards`, `Referrals` to `AccountStackParamList` and the
  navigator.
- `mobile/src/lib/api/account.ts`: `fetchOrders`, `fetchOrderDetail`,
  `fetchSubscriptions`, `fetchRewards`, `fetchReferrals`,
  `createSubscriptionPortalSession`.
- **Test:** covered by Task 1's route-level integration tests, same
  precedent as web Milestone 7/9's "thin form over an already-tested
  endpoint" scope note - no separate mobile-screen test (no RN testing
  library set up, same gap Milestone 13's plan doc already flagged).

### Task 3 — Order history & detail screens
- `mobile/src/screens/account/OrdersScreen.tsx`: list (status, date, total,
  item count), most recent first, pull-to-refresh.
- `mobile/src/screens/account/OrderDetailScreen.tsx`: line items, status,
  tracking number if present, shipping address snapshot - read-only,
  mirrors web's `/account/orders/[id]` page exactly.
- **Test:** none beyond Task 1's route coverage.

### Task 4 — Subscriptions screen
- `mobile/src/screens/account/SubscriptionsScreen.tsx`: lists the user's
  subscriptions (status, next delivery date), "Manage Subscription" button
  calls `createSubscriptionPortalSession` and opens the returned URL via
  `expo-web-browser` (Product Decision #3).
- Extends `src/app/api/webhooks/stripe/route.ts`'s existing
  `customer.subscription.updated`/`.deleted` handling **not at all** - it
  already exists from web Milestone 7 and needs no mobile-specific changes,
  since the Portal session and its resulting webhook are platform-agnostic.
- **Test:** none new - the portal-session route already has coverage from
  Milestone 7; this task is a thin screen over it.

### Task 5 — Rewards screen
- `mobile/src/screens/account/RewardsScreen.tsx`: balance at the top, full
  ledger below (date, reason, delta, linked order if any) - read-only,
  mirrors web's `/account/rewards` page.
- **Test:** none beyond Task 1's route coverage.

### Task 6 — Referrals screen
- `mobile/src/screens/account/ReferralsScreen.tsx`: referral link
  (`${appUrl}/signup?ref=${code}`) with a native share sheet
  (`expo-sharing` or `react-native`'s `Share` API - simpler, no new
  dependency) instead of web's copy-to-clipboard button; "Friends you've
  referred" status list.
- **Test:** none beyond Task 1's route coverage.

### Task 7 — Push notification infrastructure
- New migration: `public.push_tokens (expo_push_token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')), created_at
  timestamptz not null default now())`. RLS: owner-only select/delete,
  service-role-only insert/update (registration goes through a Route
  Handler, not a direct client write, same pattern as every other
  service-role-written table in this schema).
- `POST /api/account/push-tokens` (upsert on `expo_push_token`, Product
  Decision #5), `DELETE /api/account/push-tokens` (removes the caller's
  token for the device, called on sign-out).
- `mobile/src/lib/push/register.ts`: requests notification permission
  (`expo-notifications`), gets the Expo push token, calls the registration
  route - invoked from the permission-prompt flow (Task not permission UI
  itself, see below), not on every cold start.
- `mobile/src/lib/push/permission-prompt.tsx` (or inline in
  `OrderConfirmationScreen`): fires once, after an order reaches
  `status: "ready"` (Product Decision #2) - a native OS permission dialog,
  not a custom pre-prompt screen, keeping this simple for V1.
- Sign-out (`auth-context.tsx`) calls the new DELETE route before clearing
  the session (Product Decision #5).
- `src/lib/push/send.ts` (web side, server-only): `sendExpoPushNotifications
  (messages: {to, title, body, data?}[])` - batches into groups of 100 (Expo
  API's own limit) POSTs to `https://exp.host/--/api/v2/push/send`,
  authenticated with `EXPO_ACCESS_TOKEN` (Product Decision #6). Shared by
  both triggers below - written once here, used by Tasks 8 and 9.
- **Test:** integration - push-token registration upserts correctly on a
  repeat call with the same token (no duplicate rows, `user_id` reassigned
  if a different account registers the same token); DELETE removes exactly
  the caller's token, not another user's; `sendExpoPushNotifications` is
  unit-tested with the actual Expo HTTP call mocked (same "never mock the
  database, but external delivery services are the accepted exception"
  precedent as Resend in the checkout webhook tests) - confirms correct
  batching and payload shape, not real delivery.

### Task 8 — Push trigger: order shipped
- `src/app/api/admin/orders/[id]/route.ts`: after the existing `audit_logs`
  insert, if the update set `status: "shipped"` **and** the order's
  previous status wasn't already `"shipped"` (redundant PATCH calls must
  not re-send), look up `push_tokens` for `orders.user_id` (guest orders
  have no `user_id` and therefore no possible push token - naturally a
  no-op, no special-casing needed) and call `sendExpoPushNotifications`.
- **Test:** integration - marking a test order "shipped" (with a seeded
  push token for that order's user) triggers exactly one push send with the
  correct order reference in `data`; marking it "shipped" a second time (no
  status change) does not re-send; a guest order has no send attempted at
  all.

### Task 9 — Push trigger: Drop going live
- New migration: `drops.notified_at timestamptz` (nullable) - prevents a
  drop from being notified twice across repeated 1-minute polls.
- `GET /api/cron/drop-live-notifications`: protected by comparing the
  request's `Authorization` header against a new `CRON_SECRET` env var (the
  standard Vercel Cron auth pattern - Vercel signs its own cron requests
  with this same secret). Selects drops where `starts_at <= now()`,
  `notified_at is null`, and `ends_at > now()` (skips a drop that already
  ended before ever being picked up, e.g. after a deploy/downtime window -
  no point notifying about something no longer buyable). For each: sends to
  every row in `push_tokens` (a Drop-live alert is broadcast, not
  user-scoped, unlike the order-shipped trigger), then sets `notified_at`.
- `vercel.json`: new `crons` entry, `"schedule": "* * * * *"` (Product
  Decision #1).
- **Test:** integration - a seeded Drop with `starts_at` in the past and
  `notified_at` null triggers a send and gets `notified_at` set; a second
  invocation of the route does not re-send for that same drop; a Drop whose
  `starts_at` is still in the future is not notified; a request without the
  correct `CRON_SECRET` is rejected with 401 before any DB read.

### Task 10 — Final integration pass
- `npm run typecheck && npm run lint && npm run test`.
- Requires `EXPO_ACCESS_TOKEN` and `CRON_SECRET` added to the environment
  first (walked through step by step when we reach this task).
- A seeded Drop's `starts_at` set to "1 minute from now," waiting for the
  cron-equivalent local test to fire, confirming a registered test device
  actually receives the push - the one completion criterion below that
  can't be verified by an automated test alone.

---

## Completion Criteria (mirrors roadmap)

- [ ] A logged-in user sees only their own orders/rewards/referrals
      (RLS-verified, not just UI-filtered)
- [ ] A seeded Drop going live actually delivers a push notification to a
      registered test device within the expected window (~1 minute, per
      Product Decision #1)
- [ ] Marking a test order "shipped" in the existing web admin triggers a
      push to that order's customer
- [ ] Canceling a subscription in-app (via the Customer Portal) updates its
      status and is reflected immediately, matching web Milestone 7's
      completion bar exactly

## Explicitly out of scope (later milestones' job, or deferred within this one)

- Profile preferences and address management on mobile (Product Decision
  #4) - still web-only for now.
- A native in-app subscription-management UI (Product Decision #3) - the
  Customer Portal web fallback stands in, same precedent as Milestone 13's
  subscription checkout.
- Any push notification beyond the two named triggers (e.g. cart-abandonment
  reminders, promotional pushes) - not in this milestone's roadmap scope.
- React Native component/screen-level tests - same gap Milestone 13's plan
  doc already flagged; this milestone has Route Handler/webhook/cron
  integration coverage only.
