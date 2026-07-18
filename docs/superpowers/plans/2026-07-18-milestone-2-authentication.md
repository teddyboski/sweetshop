# Milestone 2: Authentication - Implementation Plan

**Goal:** Real Supabase Auth (email/password + magic link), auth UI, role-based middleware that actually protects (admin)/(account), and the guest-checkout decision documented and enforced at the schema/API level.

## Open Decision #4 - Resolved

Guest checkout is allowed. An account is optional at checkout but required for: rewards points, referral tracking, subscriptions, and order history across visits. A guest order is captured with just an email; if that email later signs up, past guest orders with a matching email get linked to the new account via a one-time backfill on signup (not automatic, to avoid account-takeover risk from someone claiming another person's guest order just by using their email).

Schema contract (enforced starting this milestone, used starting Milestone 6):
- `orders.user_id` is nullable
- `orders.guest_email` holds the email for guest orders
- exactly one of `orders.user_id` / `orders.guest_email` must be set (DB constraint)

## Tasks

### Task 1: Signup flow
- Route Handler: POST /api/auth/signup (email/password)
- Zod-validated input
- Relies on existing handle_new_user trigger for profiles row + referral_code
- Test: signup creates a real auth.users row and matching profiles row with a referral_code

### Task 2: Login flow
- Route Handler: POST /api/auth/login (email/password)
- Route Handler: POST /api/auth/magic-link (magic link request)
- Test: login with correct/incorrect credentials

### Task 3: Forgot/reset password flow
- Route Handler: POST /api/auth/forgot-password
- Route Handler: POST /api/auth/reset-password
- Test: request does not leak whether an email exists (same response either way)

### Task 4: (auth) UI pages
- Sign up, Log in, Forgot Password, Reset Password screens
- Wired to Route Handlers above via client-side fetch

### Task 5: Fix and complete src/middleware.ts
- Verify whether this file already exists on disk
- If it references `.from("users")`, fix to `.from("profiles")` to match actual schema
- Protect (account)/* -> redirect to /login if no session
- Protect (admin)/* -> redirect to /login if no session, redirect to /account if session but role != admin
- Already-authenticated visitor hitting (auth)/* -> redirect to /account
- Test: unauthenticated -> /account redirects to /login
- Test: unauthenticated -> /admin redirects to /login
- Test: authenticated non-admin -> /admin redirects to /account
- Test: authenticated -> /login redirects to /account

### Task 6: Guest checkout schema migration
- New migration: orders.user_id nullable, orders.guest_email column, CHECK constraint enforcing exactly one is set
- Document the decision inline in the migration file comments

### Task 7: E2E tests
- Playwright: sign up -> session persists -> log out -> log in
- Playwright: non-admin hitting any /admin/* route gets redirected
- Vitest integration: authenticated user A cannot read user B's profile row via any client query (RLS)

### Task 8: Self-review + CI verification
- npm run typecheck && npm run lint && npm run test all pass locally
- Push branch, open PR, confirm CI green
- Merge via merge commit per established convention
