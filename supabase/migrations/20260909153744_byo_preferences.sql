-- =========================================================================
-- BYO Preferences: replace per-row snack selections with jsonb preferences
-- on cart_items and order_items. Existing cart_item_snacks and
-- order_item_snacks rows are kept for historical order display but nothing
-- new writes to them after this migration.
-- =========================================================================

alter table public.cart_items
  add column if not exists byo_preferences jsonb;

comment on column public.cart_items.byo_preferences is
  'Build-a-Box preference selections. Only populated when item_type = ''build_a_box''. Shape: {"snackTypes": ["chips","candy"], "flavors": ["spicy","sweet"]}';

alter table public.order_items
  add column if not exists byo_preferences jsonb;

comment on column public.order_items.byo_preferences is
  'Build-a-Box preference selections copied from cart_items at checkout. Only populated when the parent order_item box has box_type = build_a_box. Shape: {"snackTypes": ["chips","candy"], "flavors": ["spicy","sweet"]}';
