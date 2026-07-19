-- Milestone 3, Task 3: demo drop data.
--
-- No real drop schedule exists yet (business decision, not built). These two
-- rows exist so the "hide Buy once quantity_limit is reached" completion
-- criterion has a real case to render and test against:
--   - one currently active, under its quantity_limit
--   - one sold out (units_sold >= quantity_limit)
-- Both reference the existing 'random-drop' box. Replace/remove once the
-- business schedules real drops via the admin dashboard (Milestone 8).

insert into public.drops (box_id, starts_at, ends_at, quantity_limit, units_sold)
select id, now() - interval '1 day', now() + interval '6 days', 100, 42
from public.boxes where slug = 'random-drop';

insert into public.drops (box_id, starts_at, ends_at, quantity_limit, units_sold)
select id, now() - interval '10 days', now() + interval '4 days', 50, 50
from public.boxes where slug = 'random-drop';
