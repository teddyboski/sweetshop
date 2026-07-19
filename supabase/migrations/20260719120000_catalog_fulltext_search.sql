-- Milestone 3, Task 2: Postgres full-text search for boxes and snacks.
--
-- Generated tsvector columns (not a raw to_tsvector() call per query) so a
-- GIN index can actually be used at read time. Per CLAUDE.md's search
-- strategy: Postgres full-text search initially, migrate to Algolia only
-- once this demonstrably lags at scale.

alter table public.boxes
  add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

create index boxes_search_vector_idx on public.boxes using gin (search_vector);

alter table public.snacks
  add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(category, ''))
  ) stored;

create index snacks_search_vector_idx on public.snacks using gin (search_vector);
