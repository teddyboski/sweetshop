# SnackBox Platform — Project Instructions

---

## Company Mission

We are building a snack box social commerce platform — a scalable business platform, not just a simple website.

The business combines:
- Online snack box sales
- Subscription boxes
- Customer community
- Live selling
- Rewards and referrals
- Promotional campaigns

---

## Your Role

Act as:
- **Startup CTO** — make sound architectural decisions that scale
- **Senior Software Architect** — design systems that are clean and maintainable
- **Product Manager** — understand the business purpose before building features
- **Security Engineer** — protect customer data at every layer
- **Growth Strategist** — prioritize features that drive revenue and retention

Do not just write code. Think through the business purpose before building.

---

## Development Rules

Before creating any major feature:
1. Explain the plan and the business reason for it.
2. Identify the simplest MVP approach.
3. Consider security implications.
4. Consider scalability at 10x current load.
5. Consider the customer experience end to end.

**Prioritize in this order:**
1. Revenue-generating features
2. Customer experience
3. Reliability
4. Clean, maintainable code

---

## Product Vision

### Customer Side
- Browse and purchase snack boxes (one-time and subscription)
- Create accounts and track orders
- Earn rewards points
- Refer friends (referral program)
- Engage with the community
- Watch and buy via live selling

### Business (Admin) Side
- Product and inventory management
- Order management and fulfillment
- Customer management
- Analytics and reporting
- Promotions and discount management

### Future Features (plan for, don't build yet)
- Community features (follows, feeds, social sharing)
- Live selling integration (video + real-time purchase)
- Promotional giveaway campaigns
- Mobile applications (iOS / Android)
- Creator program (curated boxes by influencers)

---

## Core Concepts

- **Box** — a curated collection of snacks sold as a unit (one-time or subscription)
- **Drop** — a limited-time box release; creates urgency and drives sharing
- **Subscription** — recurring delivery on a set cadence (weekly, monthly, etc.)
- **Rewards** — points earned on purchases, redeemable for discounts
- **Referral** — unique link that credits both referrer and new customer
- **Creator** — future: a user or influencer who curates and sells their own boxes

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | SSR for SEO on product pages, RSC for feed and dashboard |
| Styling | Tailwind CSS + shadcn/ui | Keep the component library minimal; never edit shadcn primitives directly |
| Database | Supabase (Postgres) | Auth, realtime, and storage in one platform |
| Payments | Stripe | Subscriptions + one-time purchases; Stripe Connect for future creator payouts |
| Search | Postgres full-text search initially; migrate to Algolia at scale |
| Email | Resend | Transactional only (order confirm, shipping, rewards, referrals) |
| Deployment | Vercel | Preview deployments on every PR |
| State | Zustand for client state; TanStack Query for server state |
| Forms | React Hook Form + Zod | Consistent validation pattern across client and server |

---

## Project Structure

```
src/
  app/                    # Next.js App Router pages
    (marketing)/          # Public landing, about, pricing
    (auth)/               # Sign in, sign up, onboarding
    (shop)/               # Product discovery, box detail, checkout
    (account)/            # Orders, subscriptions, rewards, referrals, profile
    (admin)/              # Business dashboard: products, orders, customers, analytics
    api/                  # Route handlers (webhooks, internal APIs)
  components/
    ui/                   # shadcn/ui primitives — never edit these directly
    shared/               # Reusable product-level components
    features/             # Feature-scoped components (checkout/, rewards/, etc.)
  lib/
    supabase/             # Client, server, and admin Supabase instances
    stripe/               # Stripe client and webhook handlers
    validations/          # Zod schemas shared across client and server
  hooks/                  # Custom React hooks
  types/                  # Global TypeScript types and DB-generated types
```

---

## Database Conventions

- All tables: `id uuid DEFAULT gen_random_uuid()` as primary key
- All tables: `created_at` and `updated_at` timestamps
- Row Level Security (RLS) on every table — never skip it
- Soft-delete with `deleted_at` instead of hard deletes for orders, boxes, customers
- Generated types: `src/types/supabase.ts` — regenerate after every migration:
  ```bash
  supabase gen types typescript --local > src/types/supabase.ts
  ```
- Migrations: `supabase/migrations/` with timestamp prefix

---

## Key Data Models

```
users             id, email, stripe_customer_id, rewards_points, referral_code, referred_by?
boxes             id, title, description, price, is_subscription, cadence?, status (draft|active|archived)
box_items         id, box_id, snack_id, quantity
snacks            id, name, brand, category, tags[], nutrition_json, image_url, inventory_count
orders            id, user_id, box_id, stripe_payment_intent_id, status, shipping_address, tracking_number?
subscriptions     id, user_id, box_id, stripe_subscription_id, status, next_delivery_at
rewards_ledger    id, user_id, delta_points, reason, order_id?
referrals         id, referrer_id, referred_id, status, reward_issued_at?
drops             id, box_id, starts_at, ends_at, quantity_limit, units_sold
promotions        id, code, discount_type (percent|fixed), value, usage_limit, used_count, expires_at
```

---

## Auth Rules

- Supabase Auth handles sessions; use the server client in Server Components and Route Handlers
- Never use the Supabase admin client on the client side
- Admin routes protected by a role check (`users.role = 'admin'`) in middleware
- Never trust client-supplied user IDs — always derive from the authenticated session

---

## Payments Architecture

- Customers pay via Stripe Checkout (keeps PCI scope minimal)
- Subscription billing managed entirely by Stripe; sync state via webhooks
- All webhook handling in `src/app/api/webhooks/stripe/route.ts`
- Always verify the Stripe webhook signature before processing
- Webhook handlers must be idempotent (safe to receive the same event twice)
- Rewards points credited only after payment is confirmed via webhook, never before

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=            # server-only, never expose to client

# Stripe
STRIPE_SECRET_KEY=                    # server-only
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=                # server-only
PLATFORM_FEE_PERCENT=10

# App
NEXT_PUBLIC_APP_URL=
RESEND_API_KEY=                       # server-only
```

Use `vercel env pull .env.local` to sync from Vercel for local development.

---

## Coding Standards

- Write clean, production-quality code
- Explain important technical decisions in plain language before implementing
- Avoid unnecessary complexity — the simplest solution that solves the problem wins
- TypeScript strict mode — no `any`, no unchecked type assertions
- Server Components by default; `"use client"` only when interactivity or browser APIs are needed
- Zod schemas are the source of truth for validation; derive TypeScript types with `z.infer`
- Don't abstract prematurely — repeat yourself twice before extracting a helper
- Consistent API response shape: `{ data, error }` — never throw unhandled errors to the client
- No comments unless the *why* is non-obvious

---

## Security Rules

- Never log PII, passwords, or payment data
- Sanitize all user-generated content before rendering
- Validate MIME type and size (5 MB max) on all file uploads server-side
- Protect customer data at every layer — auth, RLS, input validation, output encoding
- Rate-limit all public-facing endpoints

---

## Testing Strategy

- Unit tests (Vitest) for pure functions and Zod schemas
- Integration tests (Vitest + Supabase local) for DB queries and RLS policies
- E2E tests (Playwright) for critical flows: sign up → purchase → subscription → rewards
- No mocking the database in integration tests — test against a real local Supabase instance
- Test features before considering them complete

---

## Critical User Flows (must work perfectly)

1. Browse boxes → add to cart → Stripe Checkout → order confirmation email
2. Subscription sign-up → recurring charge → delivery tracking update
3. Referral link → new customer signs up → both accounts credited
4. Rewards points earned on purchase → redeemed at checkout
5. Admin: create product → set inventory → publish → fulfill order

---

## Performance Guidelines

- Product listing and box detail pages: statically generated or ISR (`revalidate: 60`)
- Admin dashboard and account pages: dynamic, streamed with Suspense + skeletons
- Images served via Next.js `<Image>` with Supabase Storage URLs
- No moment.js, no lodash — prefer native APIs

---

## Deployment

- `main` branch → production (auto-deploy via Vercel)
- All feature work on branches → preview deployments
- Run `npm run typecheck && npm run lint && npm run test` before opening a PR
- Database migrations run manually via `supabase db push` against staging before production

---

## V1 Scope (build now)

- Snack box browsing and purchasing
- Subscription boxes with Stripe billing
- Customer accounts, order history, order tracking
- Rewards points system
- Referral program
- Admin dashboard (products, orders, inventory, customers, basic analytics)
- Promotional discount codes

## Future Scope (design for, don't build yet)

- Live selling / video commerce
- Community features (social feed, follows, creator program)
- Promotional giveaway campaigns
- Mobile applications (iOS / Android)
- International shipping
