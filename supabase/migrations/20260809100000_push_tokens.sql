-- Milestone 14 (mobile), Task 7: push notification infrastructure.
--
-- expo_push_token is the primary key (a device's Expo token), not user_id -
-- see the plan doc's Product Decision #5. If a second account signs into
-- the same physical device, POST /api/account/push-tokens upserts on this
-- key and reassigns user_id, rather than accumulating stale duplicate rows
-- that would otherwise keep sending a previous account's pushes to a
-- device they're no longer signed into.
--
-- Registration/deregistration go through Route Handlers using the
-- service-role client (never a direct client write) - same pattern as
-- every other service-role-written table in this schema (orders,
-- order_items, subscriptions, rewards_ledger, etc.). RLS below is a
-- defense-in-depth backstop for reads/deletes, not the intended write
-- path - there is deliberately no insert/update policy for the
-- authenticated role at all, matching orders' "insert admin only" shape.

create table public.push_tokens (
  expo_push_token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now()
);
comment on table public.push_tokens is 'Registered via POST /api/account/push-tokens (Milestone 14), deregistered via DELETE on sign-out. Read by the order-shipped (Task 8) and drop-live (Task 9) push senders to look up who to notify.';
alter table public.push_tokens enable row level security;
create policy "push_tokens select own" on public.push_tokens for select using (auth.uid() = user_id or public.is_admin());
create policy "push_tokens delete own" on public.push_tokens for delete using (auth.uid() = user_id or public.is_admin());
create index push_tokens_user_id_idx on public.push_tokens(user_id);
