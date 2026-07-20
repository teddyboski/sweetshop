-- Milestone 6, Task 2 (correction): remove the duplicate subscription box.
--
-- 20260720124500_checkout_subscription_box_seed.sql incorrectly assumed no
-- subscription product existed in the catalog. It already did: the
-- original Milestone 3 seed data (20260719115452_catalog_seed_data.sql)
-- includes 'monthly-subscription' ("Monthly Snack Box Subscription", $50,
-- is_subscription = true, cadence = 'monthly', box_type = 'curated') as one
-- of the 13 legacy boxes - confirmed by tests/integration/catalog-seed-data
-- .test.ts already asserting exactly 13 boxes and a known price for that
-- exact slug, both of which broke the moment the duplicate was inserted.
--
-- Per this repo's migration convention, an already-applied migration is
-- never edited or deleted - this compensating migration removes the
-- erroneous row instead, keeping an honest, traceable history of the
-- mistake and its fix.

delete from public.boxes where slug = 'monthly-subscription-box';
