# Milestone 10: Production Rollback Plan

Companion to `2026-08-02-milestone-10-production-launch.md` and the launch
checklist. This is the "something's wrong, get back to known-good" runbook
- read it before launch day, not during an incident.

## Triggers (any one of these means: stop, assess, likely roll back)

- **Error rate**: 5xx responses exceed 5% of total requests over any
  5-minute window on Vercel's own request logs/analytics.
- **Failed webhook rate**: Stripe's own webhook delivery dashboard shows
  more than 3 consecutive failed deliveries to
  `/api/webhooks/stripe`, or the endpoint's signature verification starts
  rejecting events that Stripe's dashboard confirms it actually sent
  (points at a `STRIPE_WEBHOOK_SECRET` mismatch specifically - see
  Trigger-specific response below).
- **Payment failure spike**: Stripe's dashboard shows checkout session
  creation succeeding but a sudden spike in failed/abandoned payments
  disproportionate to normal traffic (baseline this during the soft
  launch window before going fully live).
- **Rate limiting false-positives**: legitimate customers reporting 429s
  during normal, non-abusive use (rate limiting checks are scoped and
  tuned per the plan doc, but Postgres connection pressure at real
  production scale is untested - watch this closely for the first 48
  hours).
- **Auth/RLS breakage**: any report or observation of one customer seeing
  another customer's data, or an admin route becoming reachable without
  the expected role check.

## Rollback actions

### 1. Application code (Vercel)
The fastest, lowest-risk rollback lever. Vercel keeps every previous
production deployment - from the Vercel dashboard's Deployments tab,
select the last known-good deployment (the one before the problematic
merge to `main`) and choose "Promote to Production." This takes effect
within seconds and requires no code changes, no branch reverts, no new
PR. Do this first, before touching the database, for any issue that
looks application-level rather than data-level.

### 2. Database migrations (Supabase)
Migrations in this project are additive-only so far (new tables/columns/
functions, never destructive drops or renames) - the safest rollback for
a bad migration is usually to roll the *application code* back to before
it depended on the new schema (step 1), leaving the new tables/columns
inert rather than attempting a destructive down-migration under pressure.
If a migration itself is actively causing harm (e.g., a broken trigger
firing on every write), write and apply a small, targeted down-migration
that specifically undoes that one change (`drop trigger`, `drop
function`, etc.) rather than reverting the whole migration file - keeps
the blast radius minimal. If data has already been corrupted, restore
from Supabase's point-in-time recovery / latest backup rather than
attempting to hand-patch rows.

### 3. Stripe configuration
If the live-mode webhook endpoint URL or secret is the problem (e.g., a
DNS cutover mid-flight left the webhook pointed at a stale URL), Stripe
keeps webhook endpoint history in the dashboard - reactivate the previous
endpoint and secret there, then set `STRIPE_WEBHOOK_SECRET` back on
Vercel to match and redeploy. Live-mode API keys themselves are not
rotated as part of a rollback (rolling a key back would require
Stripe support involvement) - if a key is actually compromised, that's a
security incident handled separately, not a routine rollback.

### 4. DNS / domain cutover
If the domain cutover itself is the trigger (new DNS records propagating
incorrectly, certificate issues), reverting the DNS records at the
registrar back to the previous target is the rollback - keep the
previous DNS configuration written down before cutover (see launch
checklist) specifically so this isn't a guessing exercise mid-incident.
DNS propagation delay means this is not instant - budget up to an hour
for full effect depending on TTLs set beforehand (lower TTLs before
cutover specifically to make this rollback path fast if needed).

## Order of operations during an actual incident

1. Confirm the trigger against the criteria above - don't roll back on a
   single anecdotal report without checking the dashboards.
2. Promote the last known-good Vercel deployment first (step 1) - this
   alone resolves the large majority of plausible issues.
3. If the issue persists after the app-code rollback, assess whether it's
   Stripe-config or DNS-related and apply the matching action above.
4. Only pursue a database-level rollback if the issue clearly originates
   in a migration and step 2 didn't resolve it - this is the
   highest-blast-radius action and the last resort, not the first
   reflex.
5. Once stable, write up what happened before anything else - this
   project's own incident-response conventions apply even though this is
   pre-launch infrastructure, not a live customer-facing incident yet.
