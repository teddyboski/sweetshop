-- Milestone 18: navigation/IA overhaul.
--
-- box_type ('curated' | 'build_a_box' | 'mystery') describes HOW a box is
-- assembled/sold, not what family of product it is - today it's used as a
-- catch-all, e.g. most of the seeded "mystery"-type boxes are actually
-- rotating-content snack/candy boxes, not literal blind boxes. `category`
-- is a new, orthogonal axis: which dedicated storefront page/nav
-- destination a box belongs on (Snack Boxes, Candy Boxes, Mystery Box,
-- Passport Box). It's nullable and starts unset on every existing row -
-- tagging existing/new boxes with a category is Ted's own admin data-entry
-- task (already on his punch list: "create box shells: Mystery Box, Snack
-- Box S/M/L, Candy Box S/M/L"), not something this migration backfills.
--
-- build_a_box rows don't need a category - that flow has its own
-- dedicated page/tile already, reached directly, not via a category
-- listing.
alter table public.boxes
  add column category text check (category in ('snack_box', 'candy_box', 'mystery_box', 'passport_box'));

create index boxes_category_idx on public.boxes (category);
