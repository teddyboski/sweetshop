# Routing Architecture — Design Spec

**Date:** 2026-07-08
**Status:** Approved

## Context

Defines the complete Next.js App Router structure for the SnackBox Platform:
route groups, URL structure, layout hierarchy, protected routes, error/loading
conventions, and per-group business rationale. Builds on `CLAUDE.md`'s
five-route-group baseline and `PROJECT_CONSTITUTION.md`'s folder structure
(§1) and API conventions (§3). Referenced by Milestone 1 (skeleton), and by
Milestones 2–9 as each builds out its own pages within this structure.

## Route Groups & Rationale

| Group | Why it's separate |
|---|---|
| `(marketing)` | Public, SEO-first entry point. No auth friction, fast Server Components. |
| `(auth)` | Distinct minimal layout; unique middleware behavior (redirect away if already logged in). |
| `(shop)` | The revenue-critical browse → cart → checkout path (CLAUDE.md's critical flow #1). Shares public chrome with `(marketing)`. |
| `(account)` | Everything the logged-in customer manages. One protected-route gate, one account-shell nav. |
| `(admin)` | The business-operations surface. Gated as a unit; deliberately distinct UX from customer-facing chrome. |
| `api/` | Route Handlers, not pages. Per the mobile-readiness constraint, every mutation lives here regardless of caller. |

## URL Structure

```
(marketing)   /  /about  /faq  /contact

(auth)        /login  /signup  /forgot-password  /reset-password

(shop)        /shop
              /shop/box/[slug]
              /shop/snack/[slug]
              /shop/build-a-box
              /shop/drops/[id]            (no slug — time-limited, not evergreen SEO)
              /shop/cart
              /shop/checkout
              /shop/checkout/confirmation

(account)     /account
              /account/orders(/[id])
              /account/subscriptions
              /account/rewards
              /account/referrals
              /account/profile

(admin)       /admin                      (Operations Dashboard)
              /admin/products/boxes(/[id]|/new)
              /admin/products/snacks(/[id]|/new)
              /admin/inventory
              /admin/orders(/[id])
              /admin/customers(/[id])
              /admin/rewards
              /admin/referrals
              /admin/promotions(/[id]|/new)
              /admin/drops(/[id]|/new)
              /admin/settings

api/          /api/webhooks/stripe, /api/health, plus per-resource endpoints
              added by each feature milestone per PROJECT_CONSTITUTION §3.
```

**Slugs:** `boxes` and `snacks` get a unique `slug` column (generated from
title). Drops use raw `id` — not worth the schema cost for a time-limited page.

## Layout Hierarchy

```
RootLayout (src/app/layout.tsx)
├─ (marketing)/layout.tsx  → SiteHeader + SiteFooter
├─ (auth)/layout.tsx       → minimal centered shell (logo + card, no nav)
├─ (shop)/layout.tsx       → SiteHeader + SiteFooter + cart affordance
├─ (account)/layout.tsx    → SiteHeader + AccountSidebar
└─ (admin)/layout.tsx      → AdminShell (topbar + sidebar nav), no public chrome
```

`SiteHeader`/`SiteFooter` are shared components (`src/components/shared/`),
composed into both `(marketing)/layout.tsx` and `(shop)/layout.tsx`
independently — route groups don't auto-share layouts across siblings.

## Protected vs. Public Routes

- **Public, no gate:** `(marketing)/*`, `(shop)/*` browsing/cart
- **Public, self-gating:** `(auth)/*` — already-authenticated visitor redirected to `/account`
- **Page-level gate (`middleware.ts`):**
  - `(account)/*` — no session → redirect to `/login?redirect=<original>`
  - `(admin)/*` — no session → redirect to `/login`; session but `role != 'admin'` → redirect to `/account`
- **Open decision, owned by Milestone 2:** whether `/shop/checkout` requires a session (guest checkout question). Middleware doesn't gate it either way yet.

## Routing Security Standards (mandatory — mirrored in PROJECT_CONSTITUTION.md §3)

1. Public routes never require authentication.
2. Customer account routes require an authenticated user.
3. Admin and operations routes require role-based authorization, not just authentication.
4. **Every Route Handler validates authentication and authorization itself, independently of `middleware.ts`.** Middleware is the first gate, not the only one. Backstopped by RLS.
5. **Hiding a UI element is never security.** The real enforcement is server-side, always.

## Error Pages

- `src/app/global-error.tsx` — catches anything escaping the root layout
- `src/app/not-found.tsx` — global 404
- `(shop)/error.tsx` + not-found handling for `box/[slug]`/`snack/[slug]` — revenue path, errors are mandatory per PROJECT_CONSTITUTION §5
- `(account)/error.tsx`, `(admin)/error.tsx` — group-specific messaging
- `(marketing)`/`(auth)` rely on the global boundary (YAGNI — low-risk, mostly static)

## Loading States

- `(account)` and `(admin)`: `loading.tsx` at group root and on data-heavy subpages, shadcn `Skeleton` — matches CLAUDE.md's Suspense/skeleton guideline for these two groups
- `(shop)`: `loading.tsx` on catalog/detail pages (ISR, still benefits from a loading state during client-side nav)
- `(marketing)`: no dedicated loading states (YAGNI)

## Per-Route-Group Business Documentation

### `(marketing)`
- **Primary user:** Anonymous visitor, including referral-link arrivals
- **Business purpose:** Acquisition and brand trust
- **Primary action:** Click through to `/shop` or `/signup`
- **Data required:** None — static content
- **Auth requirement:** None
- **Future expansion:** Per-campaign landing pages, blog/content marketing, embedded Whatnot schedule, creator/influencer landing pages

### `(auth)`
- **Primary user:** Anonymous visitor signing up, or existing user logging back in
- **Business purpose:** Gatekeeper for every personalized feature; attaches `referred_by` on signup
- **Primary action:** Complete signup or login
- **Data required:** Reads/writes `users`, Supabase Auth session issuance
- **Auth requirement:** None to access; self-gating away from authenticated visitors
- **Future expansion:** OAuth/social login, passwordless-only flow, mobile deep-linking, admin MFA

### `(shop)`
- **Primary user:** Anonymous browser through to committed buyer
- **Business purpose:** Revenue generation — all three revenue streams plus BYO/drop urgency mechanics
- **Primary action:** Add to cart → complete checkout
- **Data required:** Reads `boxes`/`snacks`/`box_items`/`drops`/stock; writes `orders`/`order_items`/`order_item_snacks` at checkout
- **Auth requirement:** None for browsing/cart; checkout requirement is Milestone 2's open decision
- **Future expansion:** Live-selling/Whatnot-style pages, personalization, product voting, international shipping

### `(account)`
- **Primary user:** Authenticated existing customer
- **Business purpose:** Retention and repeat purchase
- **Primary action:** Check orders, manage subscription, redeem rewards, share referral link
- **Data required:** Own-row-only, RLS-enforced reads/writes across `orders`, `subscriptions`, `rewards_ledger`, `referrals`, `customer_preferences`, `customer_activity`
- **Auth requirement:** Required, no guest access
- **Future expansion:** Community profile/follows, saved boxes, creator-program dashboard, mobile push preferences

### `(admin)`
- **Primary user:** Business owner/staff (`role = 'admin'`)
- **Business purpose:** Operations — catalog, fulfillment, customer insight, Operations Dashboard
- **Primary action:** Varies; most central is fulfilling an order or checking the dashboard
- **Data required:** Broad read/write, gated by `is_admin()` RLS policies
- **Auth requirement:** Required + `role = 'admin'`, middleware + independent Route Handler + RLS checks
- **Future expansion:** Multi-tier staff permissions, creator-program approvals, prize/giveaway campaign management, live-selling moderation

### `api/`
- **Primary user:** Non-human — browser client, Stripe webhooks, eventually a mobile client
- **Business purpose:** The mutation/integration boundary — the one auditable, securable, rate-limitable surface
- **Primary action:** Varies per endpoint
- **Data required:** Endpoint-specific, defined by that endpoint's Zod schema
- **Auth requirement:** Checked independently per endpoint, never inferred from the calling UI route
- **Future expansion:** Mobile app's entire backend surface, creator/affiliate public API, rate-limited partner endpoints
