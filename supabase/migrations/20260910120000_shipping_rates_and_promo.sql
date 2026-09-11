-- Add shipping promo support to promotions table.
alter table public.promotions
  add column if not exists applies_to_shipping boolean not null default false;

comment on column public.promotions.applies_to_shipping is
  'When true, discount applies to shipping cost instead of subtotal. percent type: shipping * (value/100) off. fixed type: shipping - value cents (floor 0).';
