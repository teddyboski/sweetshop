# SnackBox Platform (Sweet Shop) — V1 Milestone Roadmap

> **For agentic workers:** This is a milestone-level roadmap, not a bite-sized
> task plan. Before starting any milestone below, run superpowers:writing-plans
> again to produce that milestone's detailed, TDD, bite-sized implementation
> plan — then use superpowers:subagent-driven-development or
> superpowers:executing-plans to execute it.

**Goal:** Sequence the V1 build (per `docs/superpowers/specs/2026-07-07-v1-product-blueprint-design.md`) into ten shippable milestones with clear dependencies, so each milestone produces working, testable software before the next begins.

**Architecture:** Next.js App Router + Supabase (Postgres/Auth/Storage) + Stripe, per CLAUDE.md. Each milestone maps to one or more route groups (`(marketing)`, `(auth)`, `(shop)`, `(account)`, `(admin)`) and its own schema/API surface, so milestones can mostly be reviewed and merged independently.

**Tech Stack:** Next.js App Router, Tailwind + shadcn/ui, Supabase (Postgres/Auth/Storage/RLS), Stripe (Checkout + Subscriptions + webhooks), Resend, Zustand, TanStack Query, React Hook Form + Zod, Vitest + Playwright, Vercel.

## Global Constraints

- TypeScript strict mode, no `any`, no unchecked assertions
- RLS enabled on every table, no exceptions
- Server Components by default; `"use client"` only when needed
- Zod schemas are the source of truth for validation; types via `z.infer`
- Consistent API response shape: `{ data, error }`
- Rewards points credited only after Stripe webhook confirms payment, never before
- Webhook handlers must be idempotent
- `npm run typecheck && npm run lint && npm run test` must pass before any PR
- Soft delete (`deleted_at`) on orders, boxes, customers — never hard delete
- No moment.js, no lodash
- Mutating business logic (checkout, rewards, referrals, inventory, admin actions) lives in Route Handlers (`/api/*`) or Postgres (RLS/functions) — never trapped exclusively inside a page-only Server Action — so a future mobile app can call the same surface without a backend redesign
- Every admin-initiated mutation (price change, order status update, refund, manual rewards adjustment, role change) writes an `audit_logs` row — no silent admin actions

## Open Decisions Resolved Per-Milestone

Five open items from the blueprint review are not blocking the roadmap — each is pinned to the milestone where it must be resolved before that milestone's implementation plan is written:

1. **BYO box contents storage** → resolved in Milestone 4 (needs an `order_item_snacks` join table or equivalent)
2. **Inventory reservation at checkout** → resolved in Milestone 6
3. **Subscription pricing model** (fixed $50/mo product vs. price-follows-box) → resolved in Milestone 6
4. **Guest checkout vs. required account** → resolved in Milestone 2
5. **Shipping rule for snack-only carts** → resolved in Milestone 5

---

## Milestone 1: Foundation

**Features:**
- Next.js App Router scaffold with route groups: `(marketing)`, `(auth)`, `(shop)`, `(account)`, `(admin)`
- Tailwind + shadcn/ui installed, base design tokens set
- Supabase project (local + staging), initial migration with full V1 schema (as actually implemented, Milestone 1 self-review 2026-07-16): `profiles` (not `users` -- pairs with `auth.users`, standard Supabase pattern), `customer_preferences`, `customer_addresses`, `boxes`, `snacks`, `product_images`, `box_items`, `inventory`, `inventory_events`, `carts`, `cart_items`, `cart_item_snacks`, `orders`, `order_items`, `order_item_snacks`, `subscriptions`, `rewards_ledger`, `referrals`, `drops`, `promotions`, `customer_activity`, `audit_logs`, `legacy_orders`, `stripe_events`, `customer_lifetime_value` (view). Extra tables beyond the original plan (carts/cart_items/cart_item_snacks, product_images, inventory, stripe_events, customer_addresses) were added during implementation as reasonable real-world additions; reviewed and accepted as-is by project owner.
- RLS enabled on every table, default-deny, verified by test
- `src/types/supabase.ts` generated
- Env vars wired (Supabase, Stripe placeholders, Resend, app URL), `vercel env pull` documented
- Static marketing pages: Home, About, FAQ, Contact
- CI: typecheck/lint/test scripts runnable locally and in a GitHub Action
- Mobile-ready architecture locked in now: business-logic mutations (not just reads) exposed through `/api` Route Handlers that don't assume a browser/cookie session, so a future React Native app can call the same endpoints via Supabase's mobile SDKs + bearer tokens without a backend redesign

**New table — `audit_logs`:** `actor_id, action, entity_type, entity_id, before jsonb?, after jsonb?, created_at`. Distinct from `customer_activity` (customer-facing behavior) and `inventory_events` (stock-specific) — this is the admin/system accountability trail.

**Dependencies:** None — first milestone. Requires the approved blueprint spec (done).

**Completion criteria:**
- `npm run typecheck && npm run lint && npm run test` pass on the empty scaffold
- Migrations run clean against a fresh local Supabase instance and against staging
- A test confirms an anonymous/unauthenticated request cannot read any table (RLS default-deny)
- Vercel preview deployment succeeds and serves the Home page
- Marketing pages render with real Sweet Shop copy (not lorem ipsum)
- A test admin mutation (e.g. a seeded role change) produces exactly one `audit_logs` row with correct `before`/`after` values
- At least one Route Handler (not a Server Action) exists and is callable with a bearer token outside the Next.js app (e.g. via `curl`), proving the mobile-ready boundary works before any UI is built on top of it

**Suggested branch:** `milestone-1-foundation`

**Estimated effort:** 3–5 days

---

## Milestone 2: Authentication

**Features:**
- Supabase Auth: email/password + magic link sign-in
- Sign up / Log in / Forgot password screens (`(auth)` route group)
- Server-side Supabase client in Server Components/Route Handlers; admin client server-only
- Role-based middleware protecting `(admin)` routes (`users.role = 'admin'`)
- `referral_code` generated on signup
- **Resolves open decision #4:** guest checkout vs. required account

**Dependencies:** Milestone 1 (schema, route groups)

**Completion criteria:**
- Playwright E2E: sign up → session persists → log out → log in
- A non-admin user hitting any `/admin/*` route gets redirected/403
- RLS test: authenticated user A cannot read user B's row via any client query
- Guest checkout decision is documented in the milestone's own plan and implemented consistently through Milestone 6

**Suggested branch:** `milestone-2-authentication`

**Estimated effort:** 3–4 days

---

## Milestone 3: Product Catalog

**Features:**
- Catalog page (boxes + individual snacks), SSR/ISR (`revalidate: 60`)
- Box Detail and Snack Detail pages
- Drop / Limited-Release page with countdown, backed by the `drops` table
- Category/tag browsing, Postgres full-text search
- Images via Supabase Storage + Next.js `<Image>`
- Seed data: the 13-item legacy catalog transcribed from `sweetshop.middlemanmerchants.com` (Section 1 of the blueprint)

**Dependencies:** Milestone 1 (`snacks.is_sellable_individually` / `is_byo_eligible` fields, `drops` table)

**Completion criteria:**
- Catalog lists all seeded boxes and snacks with correct prices
- Editing a box's price in the DB is reflected on its detail page within 60s (ISR proof)
- A Drop page renders and correctly hides "Buy" once `quantity_limit` is reached
- Lighthouse SEO check passes on at least one detail page

**Suggested branch:** `milestone-3-product-catalog`

**Estimated effort:** 4–6 days

---

## Milestone 4: Build-A-Box

**Features:**
- Slot-picker UI for Small (8) / Medium (15) / Large (25) sizes, flat price per size
- Snack picker restricted to `is_byo_eligible = true` items
- **Resolves open decision #1:** BYO selections persisted via an `order_item_snacks` join table (or equivalent) so a specific customer's box contents are recoverable at fulfillment time
- Zustand store for in-progress box state

**Dependencies:** Milestone 3 (catalog data), schema addition from decision #1 (extends Milestone 1's schema)

**Completion criteria:**
- User can build an exactly-8/15/25-item box; submission blocked on wrong count
- Snacks flagged `is_byo_eligible = false` never appear in the picker
- A completed BYO box's exact snack list is queryable from the DB after being added to cart

**Suggested branch:** `milestone-4-build-a-box`

**Estimated effort:** 4–5 days

---

## Milestone 5: Shopping Cart

**Features:**
- Cart state (Zustand, persisted to `localStorage` pre-auth, synced to the account post-auth)
- Mixed-cart support: curated boxes + individual snacks + BYO boxes in one cart
- Cart page: quantity adjust, remove, running total
- **Resolves open decision #5:** shipping rule for snack-only carts (minimum order value or a shipping line item when no box is present)

**Dependencies:** Milestone 3, Milestone 4

**Completion criteria:**
- Cart total is correct for a mixed cart (1 box + 2 loose snacks + 1 BYO box)
- A snack-only cart under the resolved threshold either blocks checkout with a clear message or applies the resolved shipping fee — behavior matches whatever milestone 5's plan decides, no silent free-shipping loss
- Cart persists across a page reload

**Suggested branch:** `milestone-5-shopping-cart`

**Estimated effort:** 3–4 days

---

## Milestone 6: Checkout

**Features:**
- Stripe Checkout session creation (one-time and subscription mode)
- `src/app/api/webhooks/stripe/route.ts`: signature verification, idempotent event processing
- Order + `order_items` (+ `order_item_snacks` for BYO lines) written on confirmed payment
- **Resolves open decision #2:** inventory reservation — hold stock at Checkout session creation, release on session expiry, decrement permanently on webhook confirmation, recorded in `inventory_events`
- **Resolves open decision #3:** subscription pricing model, implemented in the Checkout session config
- Order confirmation email via Resend
- Rewards points credited only after webhook confirms payment (per Global Constraints)

**Dependencies:** Milestone 5 (cart), Milestone 2 (accounts / guest-checkout resolution), Milestone 1 (Stripe env vars, `inventory_events`)

**Completion criteria:**
- E2E test: Stripe test-card purchase → webhook fires → order + order_items rows created correctly → inventory decremented → confirmation email sent (or captured in test mode)
- Duplicate webhook delivery (same event ID sent twice) does not double-create the order or double-credit rewards
- A Checkout session that expires without payment releases its inventory hold

**Suggested branch:** `milestone-6-checkout`

**Estimated effort:** 5–7 days (highest-risk milestone — payments and webhooks)

---

## Milestone 7: Customer Dashboard

**Features:**
- Order history, order detail, tracking status (`(account)` route group)
- Subscription management: pause/cancel (Stripe customer portal or in-app)
- Profile & preferences editing, backed by `customer_preferences`
- Rewards balance and history view
- Referral link generation, share UI, status of referred friends

**Dependencies:** Milestone 6 (orders must exist), Milestone 2 (accounts)

**Completion criteria:**
- A logged-in customer sees only their own orders (RLS-verified, not just UI-filtered)
- Canceling a subscription updates its status and is reflected immediately in the UI
- Preferences save and persist across sessions
- Each user's referral link is unique and copies correctly

**Suggested branch:** `milestone-7-customer-dashboard`

**Estimated effort:** 4–5 days

---

## Milestone 8: Admin Dashboard

**Features:**
- **Operations Dashboard** (business-owner home screen), backed by read-only Postgres views so numbers stay live without a separate analytics pipeline:
  - Sales today
  - Orders awaiting fulfillment
  - Low inventory (threshold-based, sourced from `inventory_events`/`snacks.inventory_count`)
  - Active subscriptions
  - Customer growth (new signups over time)
  - Repeat purchase rate
  - Referral metrics (referrals sent, converted, reward payout total)
  - Revenue trends (daily/weekly/monthly, one-time vs. subscription vs. à-la-carte split per the three revenue streams)
- Boxes and Snacks CRUD (including BYO/individual-sale flags)
- Inventory: stock levels + `inventory_events` adjustment log view
- Orders: list/detail, fulfillment status update, tracking number entry
- Customers: list/detail — order history, `customer_lifetime_value`, preferences, `customer_activity`
- Rewards ledger view + manual adjustment
- Referrals list/status, Promotions CRUD, Drops scheduling
- Settings: admin user/role management
- Every mutation on this milestone's screens writes an `audit_logs` row (actor, action, entity, before/after)

**Dependencies:** Milestone 6 (orders), Milestone 3 (catalog), Milestone 1 (`customer_lifetime_value`, `inventory_events`, `customer_activity`, `audit_logs`)

**Completion criteria:**
- Admin creates a box end-to-end and it appears live on the storefront
- Admin marks an order fulfilled and enters a tracking number; customer sees the update in Milestone 7's UI
- A non-admin user gets 403 on every `/admin/*` route and every admin-only query is blocked by RLS, not just middleware
- Every Operations Dashboard metric matches a hand-computed value against seeded test data (no metric ships without a verification query behind it)
- Editing a box price or adjusting a customer's rewards balance produces a correct `audit_logs` entry

**Suggested branch:** `milestone-8-admin-dashboard`

**Estimated effort:** 6–8 days (largest surface area)

---

## Milestone 9: Rewards & Referrals

**Features:**
- Points-earning rule: `rewards_ledger` entry on confirmed order
- Points redemption at checkout
- Referral dual-sided credit on qualifying signup + first purchase
- Abuse prevention: block self-referral, cap one reward per referred account
- Promo code application at checkout: percent/fixed, `usage_limit` and `expires_at` enforced

**Dependencies:** Milestone 6 (checkout/orders), Milestone 7 and 8 (customer/admin views already scaffolded, this milestone wires real logic behind them)

**Completion criteria:**
- E2E: refer a friend → friend signs up and completes a purchase → both accounts credited exactly once
- A self-referral attempt (referrer email == referred email, or same `stripe_customer_id`) is rejected
- A promo code stops applying once `usage_limit` or `expires_at` is hit

**Suggested branch:** `milestone-9-rewards-referrals`

**Estimated effort:** 4–6 days

---

## Milestone 10: Production Launch

**Features:**
- Backfill legacy Stripe orders into `legacy_orders` via the Stripe API
- Domain cutover plan: point `sweetshop.middlemanmerchants.com` (or new domain) to the Vercel production deployment
- Production Supabase migration run (`supabase db push` against production, per CLAUDE.md deployment rules)
- Stripe live-mode key swap
- Security pass: RLS audit across all tables, rate limiting on public endpoints
- Monitoring/alerting setup, rollback plan documented and rehearsed

**Dependencies:** All previous milestones complete and verified in staging

**Completion criteria:**
- Every "Critical User Flow" from CLAUDE.md passes in production: browse→purchase→confirmation email; subscription signup→recurring charge; referral→both credited; rewards earn→redeem; admin create→publish→fulfill
- Legacy site traffic redirects correctly to the new platform
- Rollback plan is documented and has been tested at least once in staging

**Suggested branch:** `milestone-10-production-launch`

**Estimated effort:** 3–5 days (excluding post-launch monitoring/soak time)

---

## Total Estimated Effort

~45–60 developer-days sequentially (roughly 9–12 weeks solo). Milestones 3+4+5 and 7+8+9 have internal parallelization opportunity once their respective prerequisite (Milestone 1, Milestone 6) lands, if more than one engineer is available.
