-- Milestone 6, Task 1 (follow-up): seed inventory stock.
--
-- Gap discovered while implementing reserve_inventory_for_cart(): no
-- inventory row exists for any of the 18 seeded snacks at all (Milestone 1
-- created the table but never populated it, and nothing auto-creates a row
-- when a snack is created, unlike profiles' handle_new_user() trigger).
-- Without this, reserve_inventory_for_cart()'s `where quantity_on_hand >=
-- needed` would match zero rows for every snack, so every checkout attempt
-- would fail with "insufficient stock" even when it shouldn't.
--
-- A flat starting stock of 100 units per snack, same "realistic starter
-- set, business edits via the admin dashboard once it ships" caveat as the
-- original catalog seed data (20260719115452_catalog_seed_data.sql) -- not
-- real inventory counts, just enough for Milestone 6's checkout flow to be
-- testable end to end.

insert into public.inventory (snack_id, quantity_on_hand)
select id, 100
from public.snacks
where not exists (
  select 1 from public.inventory where inventory.snack_id = snacks.id
);
