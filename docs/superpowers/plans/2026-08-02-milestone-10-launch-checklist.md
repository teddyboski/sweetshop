# Milestone 10: Production Launch Checklist

This is Ted's execution runbook - every step here involves either live
credentials, production infrastructure, or DNS, none of which this
milestone's own build automates or executes on your behalf. Go top to
bottom, in order; don't skip ahead to DNS before the app and database are
confirmed healthy on the new domain.

## 0. Already verified, not re-done here

These were checked directly against the actual code during this
milestone's own planning pass (see plan doc's Ground Truth section) -
listed here so launch day doesn't waste time re-litigating them:

- Route-level auth (`src/proxy.ts`) already gates every `/account/*` and
  `/admin/*` request at the edge - confirmed present and correct.
- RLS is enabled on every table, and both admin-facing views use
  `security_invoker = true` - confirmed comprehensive, no gaps.
- Rate limiting on public endpoints - built this milestone (Task 1),
  covered by `tests/unit/rate-limit-check.test.ts` and
  `tests/integration/rate-limiting.test.ts`.

## 1. Pre-flight (before touching anything production)

1. Confirm `main` is green: `npm run typecheck && npm run lint && npm run
   test` all pass on the exact commit you intend to deploy.
2. Confirm the Milestone 10 branch has been merged to `main` via a
   reviewed PR (not pushed directly) - same convention as every prior
   milestone.
3. Lower DNS TTLs on the domain's current records to a short value (e.g.
   300s) at least one full TTL cycle before the planned cutover window,
   so the eventual cutover (and any rollback of it) propagates fast.
4. Write down the domain's *current* DNS configuration somewhere durable
   before changing anything - this is the rollback plan's prerequisite,
   not optional.

## 2. Stripe: live-mode key swap

1. In the Stripe Dashboard, switch to **Live mode** (top-left toggle).
2. Copy the live `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. In Vercel's project settings → Environment Variables (Production
   environment only - never overwrite Preview/Development), set:
   - `STRIPE_SECRET_KEY` → the live secret key
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → the live publishable key
4. In the Stripe Dashboard (still in Live mode), create a new webhook
   endpoint pointed at `https://<your-production-domain>/api/webhooks/stripe`,
   subscribed to the same event types the test-mode endpoint used
   (`checkout.session.completed` and whatever else the webhook handler
   switches on - check `src/app/api/webhooks/stripe/route.ts` for the
   exact list before creating the endpoint, since Stripe requires
   explicit event selection).
5. Copy that endpoint's signing secret into Vercel's `STRIPE_WEBHOOK_SECRET`
   (Production environment).
6. Do not deploy yet - env var changes take effect on the next deploy,
   which happens in step 4 below alongside the domain cutover.

## 3. Supabase: production migration push

1. Confirm you're targeting the *production* Supabase project, not
   staging - `supabase projects list` and check the linked project ref.
2. Run the migrations: `supabase db push` against production. Every
   migration in `supabase/migrations/` so far is additive-only (no
   destructive drops/renames), so this should be low-risk, but confirm
   the migration list about to be applied matches what you expect before
   confirming the push.
3. Regenerate types against production to confirm the schema matches
   exactly what's committed: `supabase gen types typescript --local >
   src/types/supabase.ts` (run this locally against production via
   `--project-id`, not `--local`, if your Supabase CLI version requires
   that flag - check `supabase gen types typescript --help` if unsure) -
   then `git diff` to confirm zero unexpected differences from what's
   already checked in. Any diff here means production's schema drifted
   from what the code expects - stop and investigate before proceeding.
4. Set the following in Vercel's Production environment variables if not
   already set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, matching whichever this
   codebase actually reads - check `src/lib/supabase/server.ts`),
   `SUPABASE_SERVICE_ROLE_KEY`.

## 4. Deploy

1. Trigger a fresh Production deployment on Vercel (either by merging to
   `main`, which auto-deploys, or manually redeploying the latest `main`
   commit) so the Stripe live-mode and Supabase production env vars from
   steps 2-3 actually take effect.
2. Watch the deployment build logs for any failure before proceeding.

## 5. Legacy Stripe order backfill

1. In a local shell, with `STRIPE_SECRET_KEY` set to the **live** key and
   `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` pointed at
   **production**: run `npm run backfill:legacy-orders`.
2. Read the printed summary - inserted/updated/matched counts and any
   skipped-with-error rows. Investigate anything in the skipped list
   before considering this done; the script is safe to re-run if you
   need to fix something and try again (upserts are idempotent).

## 6. Domain cutover

1. At the domain registrar, point the domain
   (`sweetshop.middlemanmerchants.com`, per the project's existing
   custom-domain naming) at Vercel per Vercel's own custom-domain
   instructions (typically an `A`/`ALIAS`/`CNAME` record to Vercel's
   provided target, plus a `TXT` record for verification if prompted).
2. Add the domain in the Vercel project's Domains settings and wait for
   Vercel to confirm it's verified and issued a certificate.
3. Update `NEXT_PUBLIC_APP_URL` in Vercel's Production environment
   variables to the final production URL, then redeploy (this value
   feeds directly into Stripe Checkout's `success_url`/`cancel_url` - see
   `src/app/api/checkout/session/route.ts` - so it must be correct before
   any real customer starts a real checkout).
4. Confirm the new domain resolves and serves the app before telling
   anyone the cutover is done.

## 7. Smoke test on the live domain

Walk through the five critical user flows from `CLAUDE.md` for real, on
the production domain, with a real (small) payment if possible:

1. Browse boxes → add to cart → Stripe Checkout → order confirmation
   email arrives.
2. Subscription sign-up → recurring charge → delivery tracking update.
3. Referral link → new customer signs up → both accounts credited.
4. Rewards points earned on purchase → redeemed at checkout.
5. Admin: create product → set inventory → publish → fulfill order.

## 8. Post-launch monitoring (first 48 hours)

- Watch Vercel's request analytics for error-rate spikes.
- Watch Stripe's webhook delivery dashboard for failed deliveries.
- Watch for any 429 reports from real customers (rate-limit
  false-positives) - see the rollback plan's trigger list.
- Keep the rollback plan
  (`2026-08-02-milestone-10-rollback-plan.md`) open in a tab, not
  something you'd have to go find under pressure.
