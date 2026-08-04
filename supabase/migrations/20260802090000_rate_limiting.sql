-- Milestone 10, Task 1: rate limiting for unauthenticated public endpoints.
--
-- Ground Truth (Milestone 10 plan doc): no rate-limit package or hand-rolled
-- logic exists anywhere in src as of this migration - a genuine, confirmed
-- gap against CLAUDE.md's own security rule ("Rate-limit all public-facing
-- endpoints"). Fixed-window counter in Postgres, no new infra dependency -
-- see plan doc Product Decision #1 for why this is sufficient at this
-- project's scale instead of an edge/Redis-based limiter.

-- =========================================================================
-- rate_limit_hits: one row per (key, window). key is caller-composed, e.g.
-- 'auth:203.0.113.7' or 'checkout:203.0.113.7' - scoped per route-group
-- (Product Decision #2) rather than globally per IP, so hitting the limit
-- on signup doesn't also block that same visitor's cart.
-- =========================================================================
create table public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, window_start)
);

alter table public.rate_limit_hits enable row level security;
-- No policies: this table is never read or written by anything except the
-- service-role client via the guarded RPC below, same default-deny pattern
-- as stripe_events (initial schema).

-- Old windows are never needed again once past. Not a foreign key /
-- cascade concern, so a plain scan-and-delete on a scheduled basis is fine;
-- indexed on window_start to make that cheap.
create index rate_limit_hits_window_start_idx on public.rate_limit_hits (window_start);

-- =========================================================================
-- check_rate_limit: atomic guarded increment, same shape as
-- increment_promotion_used_count/redeem_rewards_points (Milestone 9) -
-- upserts the current window's row and returns whether the caller is still
-- within the limit. Returns false (never throws) once the limit is
-- exceeded, so callers can turn that straight into a 429 response.
-- =========================================================================
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hit_count integer;
begin
  -- Truncating to the window size buckets every request in the current
  -- window into the same row (e.g. a 600s window aligns to :00/:10/:20...
  -- past the hour) - simpler than a sliding window and good enough for
  -- abuse protection, not billing-grade precision.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_hits (key, window_start, hit_count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set hit_count = rate_limit_hits.hit_count + 1,
                updated_at = now()
  returning hit_count into v_hit_count;

  return v_hit_count <= p_limit;
end;
$$;
comment on function public.check_rate_limit(text, integer, integer) is
  'Atomic guarded fixed-window rate-limit check (Milestone 10). Upserts the current window''s hit count for p_key and returns whether it is still within p_limit. Never throws; callers turn a false return into a 429.';
