-- snack_variants: Small / Medium / Large size tiers for house snacks.
-- Mirrors the merch_variants pattern (see 20260813120000_merchandise.sql).
-- No inventory tracking — house snacks are packed fresh per order.
-- price_cents is required (not an override) — house snacks are always
-- sold by variant, never at the flat snacks.price_cents when variants exist.
create table public.snack_variants (
  id uuid primary key default gen_random_uuid(),
  snack_id uuid not null references public.snacks(id) on delete cascade,
  size text not null check (size in ('Small', 'Medium', 'Large')),
  price_cents integer not null check (price_cents > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.snack_variants is
  'Size tiers (Small/Medium/Large) for house snacks with per-size pricing.
   No inventory tracking — house snacks are packed fresh. Archived variants
   are excluded from the storefront but kept for historical order references.';

alter table public.snack_variants enable row level security;

create policy "snack_variants public read"
  on public.snack_variants for select using (true);

create unique index snack_variants_snack_size_unique
  on public.snack_variants (snack_id, size)
  where status = 'active';
