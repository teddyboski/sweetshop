# SnackBox Platform (Sweet Shop) — Mobile App V1 Milestone Roadmap

> **For agentic workers:** This is a milestone-level roadmap, not a
> bite-sized task plan, matching the format and altitude of
> `2026-07-07-v1-milestone-roadmap.md` (the web platform's roadmap). Before
> starting any milestone below, produce that milestone's detailed,
> TDD, bite-sized implementation plan — mirroring how
> `2026-07-20-milestone-6-checkout.md` etc. were written for the web
> platform — then execute it.

**Goal:** Ship a real native iOS/Android app for Sweet Shop — not a
wrapped website — reusing the existing Supabase/Stripe backend without a
backend redesign, sequenced into five milestones so each produces working,
testable software before the next begins.

**Why native and not a Trusted Web Activity wrapper:** A TWA gets an icon
onto the home screen but stays a chrome-less browser tab underneath — no
native navigation feel, no reliable push notifications, no native payment
sheet. Given Sweet Shop's own growth mechanics (`drops` — limited-time box
releases meant to "create urgency and drives sharing," per CLAUDE.md's Core
Concepts), push notifications the instant a drop goes live are a real
retention lever a wrapped website cannot deliver. Native is the right call
here specifically, not generically.

**Architecture:** React Native via Expo, calling the *same* Supabase
project and the *same* `/api/*` Route Handlers the web app already uses —
no parallel backend, no GraphQL layer, no BFF. This was made possible on
purpose: Milestone 1 of the web roadmap states outright that
"business-logic mutations (not just reads) [are] exposed through `/api`
Route Handlers that don't assume a browser/cookie session, so a future
React Native app can call the same endpoints via Supabase's mobile SDKs +
bearer tokens without a backend redesign." This roadmap is that promise
being cashed in.

**Tech stack additions:** Expo (React Native, managed workflow),
`@supabase/supabase-js` with Expo's `SecureStore` adapter for session
persistence (bearer-token pattern, not cookies — matches
`authenticatedFetch()`'s existing contract in `src/lib/supabase/`),
React Navigation, `@stripe/stripe-react-native` for the native payment
sheet (Apple Pay / Google Pay), Expo Notifications + a new
`push_tokens` table for drop/order alerts, TanStack Query (already a
project convention per CLAUDE.md) for server state on the client.

**What's explicitly out of scope for V1 mobile:** The `(admin)` route
group. Sweet Shop's admin dashboard (Boxes/Snacks/Orders/Customers/
Rewards/Promotions/Drops CRUD) stays desktop-web-only — nothing here
requires it to work from a phone, and building a second admin surface
would roughly double this roadmap's size for no customer-facing benefit.
Live selling, the community feed, and the creator program stay exactly
where CLAUDE.md already puts them: future, not this roadmap.

## Global Constraints (carried over from CLAUDE.md, still binding)

- Never trust client-supplied user IDs — always derive from the
  authenticated session, same as every existing Route Handler.
- Rewards points credited only after Stripe webhook confirms payment,
  never before — the mobile app doesn't change this; it just calls the
  same `/api/checkout/session` and reads the same `orders`/
  `rewards_ledger` tables the web app already reads.
- RLS stays the single source of truth for what a user can read/write —
  the mobile client authenticates through the same Supabase Auth session
  as web, so every RLS policy already written applies unchanged.
- No new payment logic. `@stripe/stripe-react-native`'s payment sheet
  still creates and confirms the *same* Stripe Checkout/PaymentIntent
  objects the existing `/api/checkout/session` route already creates —
  this is a client presentation change, not a payments-architecture
  change.
- Soft-delete, audit-log, and idempotent-webhook rules from the web
  roadmap are backend rules and therefore already inherited automatically
  — nothing new to enforce client-side.

---

## Milestone 11: Mobile Foundation

**Features:**
- Expo app scaffold (managed workflow, TypeScript, EAS Build configured
  for both iOS and Android from day one so Milestone 15 isn't a scramble)
- Navigation shell: tab navigator (Shop, Search, Cart, Account) + stack
  navigators per tab, mirroring the web's route groups conceptually
  (`(shop)`, `(account)`) without literally copying URL structure
- Supabase Auth wired via `@supabase/supabase-js` + Expo `SecureStore`:
  email/password and magic-link sign-in, session persisted securely on
  device, refreshed automatically
- `authenticatedFetch`-equivalent client helper that attaches the
  Supabase session's bearer token to every call against the existing
  `/api/*` routes — this is the mobile-side half of the contract
  Milestone 1 (web) built the server-side half of
- Design system pass: this is where "not trash" gets decided. A short
  native UI kit (colors, type scale, spacing, the illustrated product
  icons already generated and live on web) established before any real
  screen is built, so Milestones 12-14 aren't improvising a look per
  screen
- App icon, splash screen, and both platforms' basic store metadata
  scaffolded now (not deferred to Milestone 15) so every subsequent
  TestFlight/internal-track build already looks like a real app during
  development, not a default Expo template

**Dependencies:** None — first milestone. Requires the design pass above
to be signed off before Milestone 12 starts.

**Completion criteria:**
- A signed-in session survives an app restart (SecureStore persistence
  proven, not assumed)
- A test call from the app to an existing `/api/*` route (e.g. a
  read-only catalog endpoint) succeeds with a bearer token and fails
  cleanly (401) without one
- Both an iOS simulator build and an Android emulator build run from a
  single Expo/EAS config with no platform-specific forks yet
- The design system doc/tokens are reviewed and approved by Ted before
  Milestone 12 begins

**Suggested branch:** `mobile-milestone-11-foundation`
**Estimated effort:** 4–6 days

---

## Milestone 12: Product Catalog & Drops

**Features:**
- Shop tab: boxes + individual snacks, pulling from the same
  `getActiveBoxes` / `getSellableSnacks` query layer the web app uses
  (via a thin `/api` read route, since the web version currently queries
  Supabase directly from Server Components — mobile needs an equivalent
  API surface, which is new work here, not reused as-is)
- Box Detail and Snack Detail screens, images served from the same
  Supabase Storage `product-images` bucket already populated (all 13 box
  + 18 snack illustrations shipped this session carry over for free —
  zero new asset work)
- Drops screen with a live countdown and the same "hides Buy once
  `quantity_limit` is reached" rule the web Drop page already enforces
- Category/tag browsing and search, backed by the same Postgres
  full-text search (`searchCatalog`, already live) behind a new
  read-only API route
- Native pull-to-refresh and skeleton-loading states (table stakes for
  "not trash" — a spinner-then-pop layout is the single fastest way an
  app reads as cheap)

**Dependencies:** Milestone 11 (auth, API client, design system).
Requires new *read-only* `/api/catalog/*` routes on the web codebase,
since the current catalog queries live inside Server Components, not
Route Handlers — this is the one deliberate gap Milestone 1's "mobile-
ready" promise didn't close (it covered *mutations*, not catalog reads),
so it gets closed here.

**Completion criteria:**
- Every box and snack visible on sweetshopcentral.com/shop is visible
  and correctly priced in the app, sourced from the same tables
- A Drop's countdown and sold-out state match the web Drop page exactly
  when tested against the same seeded data
- Search returns the same results the web full-text search returns for
  an identical query
- Cold-start to first product visible is under 2 seconds on a mid-tier
  test device (perf bar, not a vague aspiration)

**Suggested branch:** `mobile-milestone-12-catalog`
**Estimated effort:** 5–7 days

---

## Milestone 13: Cart, Build-a-Box & Native Checkout

**Features:**
- Cart screen backed by the *same* DB-backed `carts`/`cart_items`/
  `cart_item_snacks` tables and anonymous-cart-cookie-equivalent pattern
  (an anonymous ID stored in SecureStore instead of an httpOnly cookie,
  synced to `user_id` post-auth — same design, different storage
  primitive for a native client)
- Build-a-Box slot picker (8/15/25) restricted to `is_byo_eligible`
  snacks, same rule as web Milestone 4
- Checkout via `@stripe/stripe-react-native`'s native Payment Sheet,
  calling the *existing* `/api/checkout/session` route to create the
  Stripe session server-side (no new Stripe logic — the mobile SDK just
  presents Apple Pay / Google Pay / card entry natively instead of
  redirecting to Stripe's hosted Checkout page)
- Order confirmation screen reading the same webhook-confirmed `orders`
  row the web confirmation page reads — no separate confirmation logic

**Dependencies:** Milestone 12 (catalog data to build a cart from),
Milestone 11 (auth for the user-vs-anonymous cart split). This is
mobile's highest-risk milestone for the same reason web's Milestone 6
was — it's the one touching money — so budget review time accordingly.

**Completion criteria:**
- A mixed cart (1 box + 2 loose snacks + 1 BYO box) totals correctly,
  matching the web cart's total for an identical cart
- A completed native Payment Sheet purchase produces the exact same
  `orders`/`order_items`/`order_item_snacks` rows a web purchase would,
  verified by inspecting the DB after a real test-mode purchase
- Apple Pay and Google Pay both work in their respective platform's
  sandbox/test mode, not just card entry
- Duplicate webhook delivery still doesn't double-create an order or
  double-credit rewards (inherited guarantee, explicitly re-verified
  here since it's the kind of thing worth not just assuming still holds)

**Suggested branch:** `mobile-milestone-13-checkout`
**Estimated effort:** 6–8 days (highest-risk milestone — payments, same
caveat web's checkout milestone carried)

---

## Milestone 14: Account, Rewards, Referrals & Push Notifications

**Features:**
- Order history, order detail, and subscription pause/cancel — reading/
  writing the same tables and (for subscriptions) the same Stripe
  Customer Portal flow the web account pages already use
- Rewards balance/history and referral link generation/sharing, same
  data as the web `(account)` route group
- Push notification infrastructure: new `push_tokens` table
  (`user_id`, `expo_push_token`, `platform`, `created_at`), registered
  on sign-in via Expo Notifications
- Two notification triggers wired end-to-end: a Drop going live
  (scheduled against `drops.starts_at`) and an order's fulfillment
  status changing to shipped (triggered from the existing admin
  fulfillment-status-update path, which already writes an `audit_logs`
  row — this milestone adds a push send alongside that write, not a new
  admin feature)
- Notification permission prompt placed thoughtfully (after a first
  meaningful action, not on cold app open — a "not trash" detail that's
  cheap to get right and easy to get wrong)

**Dependencies:** Milestone 13 (orders must exist to have a fulfillment
status to notify about), Milestone 11 (auth to associate a push token
with a user).

**Completion criteria:**
- A logged-in user sees only their own orders/rewards/referrals
  (RLS-verified, not just UI-filtered — same standard web Milestone 7
  held itself to)
- A seeded Drop going live actually delivers a push notification to a
  registered test device within the expected window
- Marking a test order "shipped" in the existing web admin triggers a
  push to that order's customer
- Canceling a subscription in-app updates its status and is reflected
  immediately, matching web Milestone 7's completion bar exactly

**Suggested branch:** `mobile-milestone-14-account-push`
**Estimated effort:** 5–7 days

---

## Milestone 15: App Store Readiness & Launch

**Features:**
- App Store Connect + Google Play Console developer accounts set up
  (Ted's own accounts/credentials — this milestone's build work doesn't
  and can't create these on his behalf)
- Store listing assets: screenshots (real product screens, not
  placeholder), app icon final pass, short/long descriptions, privacy
  policy URL (the web app's existing `/privacy` page can likely be
  reused or lightly adapted, not written from scratch)
- Privacy nutrition labels (Apple) / Data safety form (Google) filled
  out accurately against what this app actually collects — email,
  order history, push token, nothing exotic, but it must be answered
  correctly, not copy-pasted from a template
- TestFlight (iOS) and Internal Testing track (Android) builds
  distributed for a real pre-launch smoke pass
- Apple/Google review submission, with the five critical user flows
  from CLAUDE.md walked end-to-end on each platform's review build
  before submitting: browse → purchase → confirmation; subscription
  signup → recurring charge; referral → both credited; rewards earn →
  redeem; a Drop going live → push notification received

**Dependencies:** All previous milestones complete and verified.

**Completion criteria:**
- Both apps pass their respective store review and go live
- Every "Critical User Flow" from CLAUDE.md passes on a real device on
  each platform, not just simulator/emulator
- Store listings are live with real screenshots and copy, not
  placeholder text
- A rollback/kill-switch plan exists for at least the checkout flow
  (e.g. a remote feature flag to disable native Payment Sheet and fall
  back to a web checkout link, in case a store update needs to be
  pulled) — mirrors the spirit of web Milestone 10's rollback plan

**Suggested branch:** `mobile-milestone-15-launch`
**Estimated effort:** 4–6 days, plus unpredictable app review turnaround
time on both stores (budget 1-2 weeks of calendar time for review alone,
separate from build effort)

---

## Total Estimated Effort

~24–34 developer-days sequentially (roughly 5–7 weeks solo), plus app
review calendar time in Milestone 15. Milestones 12 and parts of 14
(account screens, independent of push infra) have some internal
parallelization opportunity once Milestone 11 lands, if more than one
engineer is available — same caveat the web roadmap noted for its own
parallel-friendly milestones.
