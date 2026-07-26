-- Milestone 6, Task 2 (prerequisite): seed the Monthly Subscription box.
--
-- Gap discovered while designing the Checkout session logic: none of the
-- 13 legacy boxes seeded in Milestone 3 (20260719115452_catalog_seed_data.sql)
-- have is_subscription = true - there is no subscription product in the
-- catalog at all. The product blueprint
-- (docs/superpowers/specs/2026-07-07-v1-product-blueprint-design.md,
-- Section 1/2) lists "Monthly subscription | $50/mo" as its own distinct
-- product ("Subscriptions: same box price, billed monthly only in V1"),
-- not a subscribe-toggle on an existing one-time box. Without this row,
-- Milestone 6's subscription-mode Checkout path would have nothing real to
-- test against.

insert into public.boxes (slug, title, description, price_cents, is_subscription, cadence, box_type, slot_count, status)
values (
  'monthly-subscription-box',
  'The Monthly Subscription Box',
  'A rotating surprise snack box delivered every month, billed at the box''s current price on each renewal. Cancel or pause anytime from your account.',
  5000,
  true,
  'monthly',
  'mystery',
  null,
  'active'
)
on conflict (slug) do nothing;
