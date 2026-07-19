-- Milestone 3, Task 1: catalog seed data.
--
-- Boxes: the 13 real curated boxes from the legacy site, transcribed from
-- docs/superpowers/specs/2026-07-07-v1-product-blueprint-design.md Section 1
-- (real names and prices). Per the site's own copy, box contents rotate
-- weekly and are never guaranteed -- descriptions here intentionally avoid
-- promising a fixed item list.
--
-- Snacks: a REALISTIC STARTER SET of individual add-on snacks, invented for
-- V1 seeding (no real fixed list exists today -- see the milestone plan's
-- Product Decisions section). This is placeholder content the business is
-- expected to edit via the admin dashboard once it ships (Milestone 8).
--
-- box_items: representative EXAMPLE contents for a subset of boxes, used
-- only to illustrate "what's typically inside" on detail pages alongside a
-- "contents may vary, rotates weekly" disclaimer. Not a binding composition.

insert into public.snacks (slug, name, brand, category, tags, price_cents, is_sellable_individually, is_byo_eligible) values
  ('sour-gummy-worms', 'Sour Gummy Worms', null, 'candy', array['gummy','sour','fruity'], 300, true, true),
  ('rainbow-belts', 'Rainbow Sour Belts', null, 'candy', array['gummy','sour','fruity'], 300, true, true),
  ('chocolate-caramel-bites', 'Chocolate Caramel Bites', null, 'candy', array['chocolate','caramel'], 350, true, true),
  ('spicy-nacho-chips', 'Spicy Nacho Chips', null, 'chips', array['spicy','savory'], 350, true, true),
  ('sea-salt-kettle-chips', 'Sea Salt Kettle Chips', null, 'chips', array['salty','savory'], 350, true, true),
  ('loaded-bbq-chips', 'Loaded BBQ Chips', null, 'chips', array['savory','bbq'], 350, true, true),
  ('chocolate-chunk-cookies', 'Chocolate Chunk Cookies', null, 'cookies', array['chocolate','sweet'], 400, true, true),
  ('strawberry-wafer-cookies', 'Strawberry Wafer Cookies', null, 'cookies', array['sweet','fruity'], 300, true, true),
  ('ghost-pepper-chips', 'Ghost Pepper Chips', null, 'spicy', array['spicy','savory','extreme'], 400, true, true),
  ('spicy-mango-gummy', 'Spicy Mango Gummy', null, 'spicy', array['spicy','fruity','sweet'], 350, true, true),
  ('pretzel-bites', 'Pretzel Bites', null, 'salty', array['salty','savory'], 300, true, true),
  ('popcorn-trail-mix', 'Popcorn Trail Mix', null, 'salty', array['savory','mix'], 350, true, true),
  ('fruit-punch-rings', 'Fruit Punch Candy Rings', null, 'sweet', array['candy','fruity'], 300, true, true),
  ('mini-donut-bites', 'Mini Donut Bites', null, 'sweet', array['sweet','baked'], 400, true, true),
  ('japanese-matcha-kitkat', 'Japanese Matcha KitKat', 'Nestle Japan', 'international', array['imported','chocolate','matcha'], 600, true, false),
  ('korean-melona-bar', 'Korean Melona Bar', 'Binggrae', 'international', array['imported','frozen','melon'], 550, true, false),
  ('european-shell-less-skittles', 'European Shell-less Skittles', 'Skittles EU', 'international', array['imported','candy','fruity'], 500, true, false),
  ('thai-coconut-candy', 'Thai Coconut Candy', null, 'international', array['imported','coconut','sweet'], 500, true, false);

insert into public.boxes (slug, title, description, price_cents, is_subscription, cadence, box_type, slot_count, status) values
  ('munchie-box', 'The Munchie Box', 'Our most popular snack box, packed with candy, chips, cookies, gummies, and rotating surprise items. Contents rotate weekly -- no two boxes are exactly alike.', 1500, false, null, 'mystery', null, 'active'),
  ('sweet-and-salty', 'Sweet & Salty', 'The perfect balance of sweet candy and salty snacks packed into one box. Contents rotate weekly.', 1500, false, null, 'mystery', null, 'active'),
  ('kids-fun-snack-box', 'Kids Fun Snack Box', 'Fun candy, gummies, cookies, and colorful surprise snacks kids love. Contents rotate weekly.', 1500, false, null, 'mystery', null, 'active'),
  ('candy-filled-box', 'Candy Filled Box', 'A box loaded with our best rotating candy picks. Contents rotate weekly.', 1500, false, null, 'mystery', null, 'active'),
  ('mini-mystery', 'Mini Mystery', 'A smaller surprise assortment for a quick snack fix.', 2500, false, null, 'mystery', null, 'active'),
  ('random-drop', 'Random Drop', 'A totally random assortment -- you never know what you will get. Contents rotate weekly.', 2500, false, null, 'mystery', null, 'active'),
  ('spicy-chaos', 'Spicy Chaos', 'For heat-seekers: a rotating mix of the spiciest snacks we can find.', 2500, false, null, 'mystery', null, 'active'),
  ('sugar-rush', 'Sugar Rush', 'A rotating all-candy, all-sugar assortment for the sweet tooth.', 2500, false, null, 'mystery', null, 'active'),
  ('passport-box', 'The Passport Box: Ultimate Worldwide Exotic Feast', 'A premium mystery vault loaded with 15-20 exclusive, hard-to-find international imports -- shell-less European Skittles, Japanese fruit chews, gourmet Asian pastries, and rare global flavor cross-overs. Fixed curated experience; products alternate based on supply.', 7500, false, null, 'mystery', null, 'active'),
  ('build-a-box-small', 'Build a Box - Small', 'Pick exactly 8 snacks and build your own box, flat price regardless of what you choose.', 1500, false, null, 'build_a_box', 8, 'active'),
  ('build-a-box-medium', 'Build a Box - Medium', 'Pick exactly 15 snacks and build your own box, flat price regardless of what you choose.', 2500, false, null, 'build_a_box', 15, 'active'),
  ('build-a-box-large', 'Build a Box - Large', 'Pick exactly 25 snacks and build your own box, flat price regardless of what you choose.', 3500, false, null, 'build_a_box', 25, 'active'),
  ('monthly-subscription', 'Monthly Snack Box Subscription', 'A fresh, rotating exotic snack haul delivered every month. Cancel anytime.', 5000, true, 'monthly', 'curated', null, 'active');

-- Representative example contents for a subset of boxes (illustrative only).
insert into public.box_items (box_id, snack_id, quantity)
select b.id, s.id, 1
from public.boxes b, public.snacks s
where b.slug = 'munchie-box' and s.slug in ('sour-gummy-worms', 'spicy-nacho-chips', 'chocolate-chunk-cookies', 'pretzel-bites');

insert into public.box_items (box_id, snack_id, quantity)
select b.id, s.id, 1
from public.boxes b, public.snacks s
where b.slug = 'sweet-and-salty' and s.slug in ('rainbow-belts', 'sea-salt-kettle-chips', 'fruit-punch-rings');

insert into public.box_items (box_id, snack_id, quantity)
select b.id, s.id, 1
from public.boxes b, public.snacks s
where b.slug = 'spicy-chaos' and s.slug in ('ghost-pepper-chips', 'spicy-mango-gummy');

insert into public.box_items (box_id, snack_id, quantity)
select b.id, s.id, 1
from public.boxes b, public.snacks s
where b.slug = 'passport-box' and s.slug in ('japanese-matcha-kitkat', 'korean-melona-bar', 'european-shell-less-skittles', 'thai-coconut-candy');
