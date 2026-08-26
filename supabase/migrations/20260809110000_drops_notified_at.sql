-- Milestone 14 (mobile), Task 9: drop-live push notification trigger.
--
-- Prevents a drop from being notified twice across repeated polls from the
-- new GET /api/cron/drop-live-notifications route (Vercel Cron, every
-- minute per the plan doc's Product Decision #1) - null until that route
-- successfully sends for a given drop, then set once.

alter table public.drops
  add column notified_at timestamptz;

comment on column public.drops.notified_at is 'Set by GET /api/cron/drop-live-notifications (Milestone 14) once a push has gone out for this drop going live. Null means not yet notified - the poll query filters on this being null so a drop is never double-notified across repeated 1-minute cron invocations.';
