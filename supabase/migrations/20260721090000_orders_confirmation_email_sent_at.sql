-- Milestone 6, Task 4: order confirmation email tracking.
--
-- The webhook's order-creation idempotency check (orders.stripe_checkout_
-- session_id) returns early on a redelivered checkout.session.completed
-- event once the order already exists. Without a separate signal, a
-- Resend failure on the FIRST delivery would never get retried - the order
-- exists, so any later redelivery would just no-op before ever reaching the
-- email step again.
--
-- This column lets the webhook distinguish "order exists, email already
-- sent" (true no-op) from "order exists, email still unsent" (redelivery
-- should still attempt the email). The webhook route pairs this with
-- deliberately returning a non-2xx status when the email send fails (even
-- though the order itself was created successfully) so Stripe's own retry
-- schedule redelivers the event and retries just the email step - no
-- separate retry queue needed for V1.

alter table public.orders
  add column confirmation_email_sent_at timestamptz;

comment on column public.orders.confirmation_email_sent_at is
  'Set by the Stripe webhook (checkout.session.completed handler) once the order confirmation email has been successfully sent via Resend. Null means either not yet attempted or the last attempt failed - the webhook intentionally returns a non-2xx status on email failure so Stripe redelivers the event and retries just this step, without recreating the order.';
