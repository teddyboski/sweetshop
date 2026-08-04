# Milestone 10: Production Launch — Implementation Plan

**Branch:** `milestone-10-production-launch`
**Depends on:** Milestones 1–9 (all merged to `main` as of 2026-08-01, PR #10)

## Ground Truth (verified against actual code, not assumed)

- **Route-level auth is already solid.** `src/proxy.ts` (Next.js 16's
  middleware-equivalent — renamed from `middleware.ts`, easy to miss on a
  filename-only search) gates every `/account/*` and `/admin/*` request at
  the edge: no session → redirect to `/login?redirect=<path>`; session but
  non-admin hitting `/admin/*` → redirect to `/account`; already-authenticated
  hitting an auth page → redirect to `/account`. This was mistakenly flagged
  as a live vulnerability during this milestone's own planning session and
  then corrected once `proxy.ts` was found — recorded here so the mistake
  isn't repeated. No route-level auth work is needed in this milestone.
- **RLS coverage is comprehensive.** Every table in
  `20260710220202_initial_schema.sql` has `enable row level security` in
  the same migration it's created in. Neither of the two later migrations
  (`20260730130000_admin_dashboard_foundations.sql`,
  `20260731090000_rewards_referrals.sql`) creates a new table, so there's
  no coverage gap to close. Both read-only views
  (`customer_lifetime_value`, `revenue_by_stream_daily`) already use
  `security_invoker = true` with an explicit comment explaining why
  (without it, views run as their creator and silently bypass RLS). No RLS
  remediation needed.
- **Rate limiting is a genuine, confirmed gap.** No rate-limiting package
  (`@upstash/ratelimit` or equivalent) in `package.json`, and no
  hand-rolled rate-limit logic anywhere in `src` (grepped the whole tree).
  CLAUDE.md's own security rules require this ("Rate-limit all
  public-facing endpoints") and it's never been built. This is real work
  for this milestone.
- **`legacy_orders` schema** (already exists, unused until now):
  `stripe_payment_intent_id text unique, email text, amount_cents integer,
  product_description text, created_at timestamptz, matched_user_id uuid
  references profiles(id)`. RLS: admin-only. Backfill needs to paginate
  Stripe's PaymentIntents API, upsert on `stripe_payment_intent_id`
  (idempotent re-runs), and best-effort match `email` against existing
  `profiles` to set `matched_user_id`.
- **No `scripts/` directory exists yet** — this milestone's backfill
  script is the first thing to live there.
- Stripe live-mode key swap and the actual `supabase db push` against
  production are **execution steps, not code** — this milestone produces
  the script/checklist for both, but Ted runs them by hand with the real
  production credentials. Same for the DNS/domain cutover.

## Product Decisions (confirmed 2026-08-02)

1. **Rate limiting: fixed-window, per-IP, in Postgres** — no new
   infrastructure dependency (no Redis/Upstash account needed). A single
   `rate_limit_hits` table with a guarded increment RPC (same
   guarded-counter pattern as `increment_promotion_used_count` from
   Milestone 9), called from a small helper at the top of each public
   Route Handler. Good enough for this project's traffic scale; revisit
   with an edge-based limiter (Upstash) only if a real abuse incident
   demands lower latency than an extra DB round-trip.
2. **Rate limit scope:** every route under `/api/*` that doesn't already
   require authentication is in scope — signup, login, magic-link,
   forgot-password, reset-password, checkout session creation, cart
   mutations. Authenticated admin/account routes are already behind
   `proxy.ts` and rely on Supabase Auth's own session limits; not
   duplicated here.
3. **Legacy backfill matching:** match `email` case-insensitively against
   `profiles.email`; if no match, `matched_user_id` stays null (the row is
   still inserted — a legacy order isn't discarded just because the
   customer never made an account on the new platform).

## Tasks

### Task 1 — Rate limiting
- New migration: `rate_limit_hits` table (`key text, window_start
  timestamptz, hit_count integer`) plus a guarded RPC
  `public.check_rate_limit(p_key text, p_limit integer, p_window_seconds
  integer) returns boolean` — upserts the current window's row, increments
  `hit_count`, returns `hit_count <= p_limit`.
- `src/lib/rate-limit/check.ts`: thin wrapper resolving the caller's IP
  from Next.js request headers (`x-forwarded-for`, falling back to a
  constant for local dev) and calling the RPC via the admin client.
- Wire into every unauthenticated public route handler identified above:
  60 requests/10 minutes per IP for auth routes (signup/login/magic-link/
  password reset), 30 requests/minute for checkout/cart routes. Returns
  429 with a `Retry-After` header on rejection.
- **Test:** integration — hammering a route past its limit returns 429;
  a different IP is unaffected; the window resets after
  `window_seconds` elapses.

### Task 2 — Legacy Stripe order backfill script
- `scripts/backfill-legacy-orders.ts`: paginate
  `stripe.paymentIntents.list({ limit: 100, starting_after })` in
  live mode, filter to `status: 'succeeded'`, upsert into
  `legacy_orders` on `stripe_payment_intent_id` (idempotent — safe to
  re-run), look up `profiles` by lower-cased email for `matched_user_id`.
  Logs a summary (rows inserted/updated/matched) at the end, never throws
  away partial progress on a single bad record (log and continue).
- **Test:** integration against a handful of hand-seeded fake
  PaymentIntent-shaped records (mocked Stripe client, not live Stripe) —
  confirms upsert idempotency and email matching.

### Task 3 — Rollback plan
- `docs/superpowers/plans/2026-08-02-milestone-10-rollback-plan.md`:
  concrete triggers (error rate threshold, failed webhook rate, payment
  failure spike), the exact Vercel rollback action (redeploy previous
  production deployment), Supabase migration rollback approach (down
  migration or restore-from-backup, whichever applies), and Stripe
  key/webhook re-pointing steps if a rollback requires reverting to a
  previous webhook endpoint version.

### Task 4 — Domain cutover + production checklist
- `docs/superpowers/plans/2026-08-02-milestone-10-launch-checklist.md`:
  ordered, step-by-step checklist covering DNS cutover
  (`sweetshop.middlemanmerchants.com` → Vercel), production Supabase
  migration push, Stripe live-mode key swap, and the security items
  already verified above (documented as "already satisfied" rather than
  re-done). This is Ted's execution runbook, not code.

### Task 5 — Final verification pass
- `npm run typecheck && npm run lint && npm run test`.
- Manual smoke test of rate limiting against the running dev server.

## Completion Criteria (mirrors roadmap)

- [ ] Every unauthenticated public API route rejects with 429 past its
      rate limit
- [ ] Legacy Stripe orders backfill idempotently, matched to existing
      profiles by email where possible
- [ ] Rollback plan is documented with concrete triggers and steps
- [ ] Launch checklist covers DNS cutover, production migration push,
      and Stripe live-key swap as explicit, ordered, human-executed steps
- [ ] `npm run typecheck && npm run lint && npm run test` all pass

## Explicitly out of scope

- Rebuilding route-level auth or RLS — both already verified solid,
  see Ground Truth above
- An edge/Redis-based rate limiter — the simple Postgres version is
  sufficient for this project's scale (see Product Decision #1)
- Actually executing the production migration push, Stripe live-key
  swap, or DNS cutover — those are Ted's manual steps per the launch
  checklist, not something run автоматически during this milestone
