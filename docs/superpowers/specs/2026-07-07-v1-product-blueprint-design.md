# V1 Product Blueprint — SnackBox Platform (Sweet Shop)

**Date:** 2026-07-07
**Status:** Approved by user, pending implementation planning

## 0. Context

This blueprint precedes scaffolding. It establishes the business model, user types,
prioritized V1 feature set, future-ready architecture principles, database design,
app screen inventory, and technology rationale for the SnackBox Platform — which is
the long-term commerce platform for the existing business **The Sweet Shop**
(social handles: `@sweet_shop_official`).

This document builds on `CLAUDE.md` (authoritative source for stack, conventions,
and V1/Future scope) and does not contradict it except where explicitly noted
(order data model — see Section 5).

## 1. Existing Site Analysis & Integration Strategy

**Site analyzed:** `sweetshop.middlemanmerchants.com`

**Platform:** Google Sites (custom domain), confirmed via response headers
(`Server: ESF`, Google Sites CSP/reporting signatures) and the page's own
"Report abuse" widget, which reveals the underlying path
`sites.google.com/middlemanmerchants.com/sweetshop/shop`. The shop/cart/build-a-box
pages are a hand-coded HTML/CSS/JS bundle embedded via a Google Sites "Custom Embed"
iframe — not a native Sites feature.

**Checkout mechanism:** every "Buy Now" button links to a static **Stripe Payment
Link** (`buy.stripe.com/...`), one per product/size, opened in a new tab. No Stripe
API integration, no webhook, no server exists behind the site. The on-page "cart" is
cosmetic — it writes to `localStorage` for display only. The cart page's "Checkout"
button is a single hardcoded Payment Link that does not carry the actual cart
contents/total, meaning multi-item checkout today likely does not charge the correct
amount. This is a known live bug on the current site, noted here for awareness, not
something this platform needs to preserve.

**Integrate or replace:** **Replace.** There is no backend, database, or API to
integrate with — Google Sites has none, and the checkout is static payment links, not
a programmatic integration. The only real structured system behind the current site
is the **Stripe account**, which should be reused (not recreated) for payout and
verification continuity.

**Data to migrate:**

| Data | Current state | Action |
|---|---|---|
| Products | Hardcoded in HTML, no database | Transcribe into `boxes`/`snacks` seed data (catalog captured below) |
| Customers | No accounts exist; only checkout emails captured by Stripe | No account migration needed; optionally backfill emails from Stripe for return-customer recognition |
| Orders | Real, in Stripe (Payment Intents behind the Payment Links) | Backfill via Stripe API into `legacy_orders` (Section 5) for reporting continuity only |
| Inventory | Does not exist — boxes are hand-packed to order | Not migrated; V1 establishes inventory tracking from zero |

**Current catalog (for seed data):**

| Box | Price |
|---|---|
| Munchie Box (Best Seller) | $15 |
| Sweet & Salty | $15 |
| Kids Fun Snack Box | $15 |
| Candy Filled Box | $15 |
| Mini Mystery | $25 |
| Random Drop | $25 |
| Spicy Chaos | $25 |
| Sugar Rush | $25 |
| Passport Box (exotic imports, premium) | $75 |
| Build a Box — Small (8 items) | $15 |
| Build a Box — Medium (15 items) | $25 |
| Build a Box — Large (25 items) | $35 |
| Monthly subscription | $50/mo |

Live selling already happens externally on **Whatnot** (`whatnot.com/user/thesweetshop`).
No public commerce API exists for this integration; it remains a "post and link"
relationship, consistent with treating live selling as Future Scope.

**Architecture decision:** Rebuild the storefront entirely on the SnackBox Platform.
The Google Sites site **remains live and unchanged as the legacy storefront during
development** — no parallel data sync is needed since it has no backend state to
sync. Cut the domain over in one move once accounts, checkout, and orders are
verified end-to-end on the new platform. Reuse the existing Stripe account.

## 2. Business Model

**Revenue streams (V1):**
1. One-time box purchases (curated boxes + Build-Your-Own)
2. Subscription boxes (monthly, recurring via Stripe Subscriptions)
3. **Individual snack purchases (à la carte)** — new relative to the legacy site;
   snacks become a standalone sellable catalog item, not only box components. Track
   separately in analytics; likely different margin profile than curated boxes.

Drops (limited-time releases) are a conversion multiplier on box sales, not a
separate revenue stream.

**Pricing structure:**
- Curated boxes: admin-set flat price
- Build-Your-Own: fixed slot count (e.g. 8/15/25 items), flat price regardless of
  which snacks are chosen. Premium snacks are excluded from the BYO pool via an
  `is_byo_eligible` flag (Section 5) to protect margin.
- Subscriptions: same box price, billed monthly only in V1
- Shipping: bundled into box price (no separate checkout line item); domestic only

**Customer acquisition (V1 design target):** referral-led + organic social sharing
of drops. No paid-ad attribution infrastructure in V1. The referral program
(`referrals` table) is the built-in acquisition loop.

**Platform identity:** this is not a generic multi-tenant platform — it **is** The
Sweet Shop's long-term commerce ecosystem, designed around snack commerce, customer
community, social commerce, repeat purchases, subscriptions, rewards, referrals, and
future promotional campaigns.

## 3. User Types

- **Customer** — buyer/subscriber. `users.role = 'customer'`.
- **Admin** — staff operating the business (products, orders, inventory, customers,
  analytics). `users.role = 'admin'`, gated in middleware per CLAUDE.md.
- **Community member** *(future, light touch)* — a customer who follows/shares/
  engages socially. No `users` schema change needed now; extends later via additive
  `follows`/`profiles` tables.
- **Promotion participant** *(future, light touch)* — a customer entering a
  giveaway/prize campaign. Extends later via an additive `giveaway_entries` table.

## 4. Core V1 Features (ranked)

**P0 — core transaction path, build first:**
1. Product Catalog — covers both curated Boxes and individual Snacks
2. Snack Box Storefront — curated boxes, drops
3. Build-Your-Own Box — fixed slot count, flat price
4. Customer Accounts — signup/login, profile, preferences, saved addresses
5. Checkout — Stripe Checkout, one-time + subscription
6. Orders — history, status, tracking
7. Shipping — domestic, bundled into price, manual label purchase by admin

**P1 — V1 scope, built once the core path works end-to-end:**
8. Rewards — points ledger, earn on purchase, redeem at checkout
9. Referrals — unique link, dual-sided credit
10. Promo codes — percent/fixed discounts
11. Admin Dashboard — products, orders, inventory, customers, basic analytics

## 5. Future-Ready Architecture

Design rule: **every future feature attaches via new tables with foreign keys into
`users`/`boxes`/`orders`, never by reshaping V1 tables.**

- **Live selling / Whatnot-style drops** — `drops` already has `starts_at`,
  `ends_at`, `quantity_limit`, `box_id`. A future `live_sessions` table references
  `drops.id`; no V1 change needed.
- **Influencer/creator partnerships** — `referrals.referrer_id` already generalizes
  to "any user who refers." A future `creator_profile` table extends `users` without
  touching `orders`/`boxes`.
- **Promotional campaigns / prize management** — kept separate from `promotions`
  (discount codes are transactional; campaigns/giveaways are engagement mechanics)
  so they evolve independently. A future `campaigns`/`giveaway_entries` pair does not
  touch checkout logic.
- **Community (feed, follows, voting)** — additive tables hanging off `users.id`
  only.

## 6. Database Design

Builds on CLAUDE.md's baseline schema (`users`, `boxes`, `box_items`, `snacks`,
`orders`, `subscriptions`, `rewards_ledger`, `referrals`, `drops`, `promotions`).

**Changed from CLAUDE.md baseline:**

- **`snacks`** gains `price`, `is_sellable_individually`, `is_byo_eligible`. It
  becomes a real standalone product, not only a box-composition reference.
- **`order_items` (new)** — orders can no longer assume a single `box_id`. Once
  snacks are individually purchasable, a cart can mix a box with loose snacks.
  `order_items(order_id, item_type: box|snack, box_id?, snack_id?, quantity,
  unit_price)` replaces the implicit single-box-per-order assumption. **This is a
  deliberate deviation from CLAUDE.md's original `orders.box_id` single-reference
  shape**, driven by the new à-la-carte snack requirement.

**New tables:**

- **`customer_preferences`** — `user_id, dietary_restrictions[], disliked_categories[],
  flavor_profile[], spice_tolerance, marketing_opt_in`. Kept separate from `users`
  so preferences are queryable for curation (e.g. "how many customers are nut-free").
- **`customer_lifetime_value`** — a **view** (not a stored table):
  `user_id, total_orders, total_spend, first_order_at, last_order_at,
  avg_order_value`, computed from `orders`. Avoids sync bugs at V1 scale; promote to
  a materialized view later only if it becomes a read hotspot.
- **`inventory_events`** — `snack_id, delta, reason (restock|order|adjustment|
  byo_reservation), reference_id, created_by, created_at`. `snacks.inventory_count`
  stays the fast-read current count; this table is the audit trail behind it.
- **`customer_activity`** — `user_id, event_type (order_placed|box_viewed|
  referral_sent|reward_redeemed|subscription_paused|preference_updated|
  drop_viewed), metadata jsonb, created_at`. Feeds CLV and personalization now, and
  is the foundation the future community feed / product-voting features will read
  from — logged from day one since it can't be backfilled later.
- **`legacy_orders`** — `stripe_payment_intent_id, email, amount,
  product_description, created_at, matched_user_id?`. Holds Sweet Shop's Google
  Sites-era Stripe orders (backfilled via Stripe API), kept separate from live
  `orders` since the old data has no real product/box reference. Used for reporting
  continuity and matching returning customers by email.
- **`audit_logs`** — `actor_id, action, entity_type, entity_id, before jsonb?,
  after jsonb?, created_at`. The admin/system accountability trail — every
  admin-initiated mutation (price change, order status update, refund, manual
  rewards adjustment, role change) writes a row here. Distinct from
  `customer_activity` (customer-facing behavior, not admin actions) and
  `inventory_events` (stock-specific only).

**Unchanged from CLAUDE.md:** `users`, `boxes`, `box_items`, `subscriptions`,
`rewards_ledger`, `referrals`, `drops`, `promotions`.

**Mobile-readiness principle (applies platform-wide, not a new table):** mutating
business logic — checkout, rewards, referrals, inventory, admin actions — is
exposed through `/api` Route Handlers or Postgres (RLS/functions), never trapped
exclusively inside a page-only Next.js Server Action. Supabase Auth and Storage
already have first-party mobile SDKs, so the only platform-specific risk was
business logic becoming reachable only from browser-session Server Actions. This
constraint removes that risk without deferring any V1 work — it changes *where*
V1 logic lives, not *what* gets built now. A future iOS/Android app (Future Scope
per CLAUDE.md) would consume the same Route Handlers and RLS-protected tables a
web client uses, with no backend redesign.

## 7. App Screens

**Customer app:** Home · Shop/Catalog (boxes + snacks, filters) · Box Detail ·
Snack Detail · Build-a-Box · Mystery Box Detail · Drop/Limited Release (countdown) ·
Cart · Checkout · Order Confirmation · Sign up / Log in / Forgot password ·
Account: Profile & Preferences · Account: Order History/Detail/Tracking ·
Account: Subscriptions (manage/pause/cancel) · Account: Rewards (balance/history/
redeem) · Account: Referrals (share link/status) · FAQ/About/Contact

**Admin dashboard:** Operations Dashboard (sales today, orders awaiting
fulfillment, low inventory, active subscriptions, customer growth, repeat
purchase rate, referral metrics, revenue trends) · Products: Boxes (list/create/
edit) · Products: Snacks (list/create/edit, inventory, price, BYO/individual-sale
flags) · Inventory (stock levels + adjustment log) · Orders (list/detail/
fulfillment/tracking entry) · Customers (list/detail: orders, CLV, preferences,
activity) · Rewards (ledger view, manual adjustment) · Referrals (list/status) ·
Promotions (create/edit codes) · Drops (schedule/manage) · Settings (admin users/
roles)

## 8. Technology Decisions

- **Next.js App Router** — SSR for SEO on box/snack detail pages (organic + referral
  traffic matters since paid ads are out of V1 scope); ISR (`revalidate: 60`) scales
  cheap read traffic.
- **Supabase/Postgres** — one platform for auth + DB + storage keeps integration
  surface small for a lean team; RLS enforces "protect customer data at every
  layer"; a plain view handles CLV without a separate analytics pipeline at V1
  scale.
- **Stripe** — owns PCI scope entirely; Checkout + Subscriptions covers all three
  revenue streams without custom billing logic; idempotent webhooks drive order/
  rewards state.
- **Tailwind + shadcn/ui** — shadcn primitives are copied into the repo, not an npm
  dependency, so no upgrade-breakage risk as the design system grows.
- **Zustand + TanStack Query** — ephemeral client state (cart, BYO builder) stays
  separate from server state (catalog, orders), avoiding staleness bugs as read
  volume grows.
- **Vercel** — preview deployments match the branch workflow in CLAUDE.md; scaling
  is a plan upgrade, not a re-architecture.

**Scaling path at 10x:** Postgres read replicas + Supabase connection pooling before
any schema change → materialize the CLV view once it's read more than it's cheap to
compute live → move search to Algolia only once Postgres full-text demonstrably
lags → introduce a job queue (Supabase Edge Functions + a job table, or Inngest)
once webhook-triggered work starts blocking request paths.
