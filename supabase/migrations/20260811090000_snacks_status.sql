-- Adds a status flag to snacks, mirroring boxes.status's already-established
-- pattern (draft|active|archived) but narrowed to active|archived - snacks
-- don't have boxes' separate "not published yet" workflow, so a draft state
-- would be unused complexity. Ted's own words testing the admin dashboard,
-- 2026-08-11: "I could not remove products that I don't have... it's too
-- complicated to understand." There was previously no way to remove a snack
-- from customer-facing surfaces at all - archiving is the fix, not a hard
-- delete, since existing order_items/cart_item_snacks rows reference
-- snacks.id and must keep working for historical orders.
alter table public.snacks
  add column status text not null default 'active' check (status in ('active', 'archived'));

create index snacks_status_idx on public.snacks(status);
