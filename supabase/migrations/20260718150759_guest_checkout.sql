-- Milestone 2, Task 6: guest checkout schema contract.
--
-- Decision (documented in docs/superpowers/plans/2026-07-18-milestone-2-authentication.md):
-- guest checkout is allowed. An account is optional at checkout but required
-- for rewards points, referral tracking, subscriptions, and order history
-- across visits. A guest order is captured with just an email; if that email
-- later signs up, past guest orders with a matching email can be linked to
-- the new account via a one-time backfill on signup (not automatic, to avoid
-- account-takeover risk from someone claiming another person's guest order
-- just by using their email).
--
-- This migration only establishes the schema contract for Milestone 6
-- (checkout) to build against. No checkout UI or Route Handler exists yet.

alter table public.orders
  alter column user_id drop not null;

alter table public.orders
  add column guest_email text;

alter table public.orders
  add constraint orders_user_or_guest_email_check
  check (
    (user_id is not null and guest_email is null)
    or (user_id is null and guest_email is not null)
  );

comment on column public.orders.guest_email is 'Email captured for a guest checkout (no account). Exactly one of user_id / guest_email must be set, enforced by orders_user_or_guest_email_check. See migration header note and docs/superpowers/plans/2026-07-18-milestone-2-authentication.md for the guest-checkout decision.';
