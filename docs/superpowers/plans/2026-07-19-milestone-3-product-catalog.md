# Milestone 3: Product Catalog — Implementation Plan

**Date:** 2026-07-19
**Status:** Draft, pending approval
**Branch:** `milestone-3-product-catalog`
**Depends on:** Milestone 1 (schema, RLS), Milestone 2 (auth — not required for browsing, but shared layout/header depends on it)

Builds the P0 #1 feature from the product blueprint: browsing for both curated
Boxes and individual Snacks, backed by the schema Milestone 1 already shipped.
No new tables required except a full-text search index and one addition noted
in Product Decisions below.

---

## Context: seed data already exists in staging

Migration `20260719115452_catalog_seed_data.sql` (committed to `main` on
2026-07-19, reconciling drift found in staging) already inserted:
- 13 real legacy boxes (see blueprint spec §1) as `boxes` rows
- 18 starter snacks as `snacks` rows
- Example `box_items` for 4 boxes (illustrative "what's typically inside")

This plan's Task 1 was originally "seed catalog data" per the roadmap; it's
now "verify the existing seed is correct and complete" instead, since the
data already landed. Everything from Task 2 onward is genuinely unbuilt.

---

## Product Decisions (resolved here, since the roadmap defers them to this plan)

**1. Full-text search implementation.** Postgres full-text search per
CLAUDE.md, via a generated `tsvector` column + GIN index on `boxes` (title,
description) and `snacks` (name, brand, category) — not a raw `to_tsvector()`
call per query, which can't use an index. Requires one new migration
(schema change, not just seed data) — see Task 2.

**2. Product images — no real assets exist yet.** The legacy Google Sites
store has photos, but nothing has been migrated into Supabase Storage, and
`product_images` is currently empty for every seeded box/snack. Rather than
fabricate placeholder `image_url` values pointing at nothing, catalog/detail
pages render a defined empty-image state (icon + `alt=""`) when a product has
no `product_images` row, per PROJECT_CONSTITUTION §5's "loading/empty/error
states are not optional." Uploading real photos is explicitly out of scope
here — it happens via the admin dashboard in Milestone 8, or can be
fast-followed manually before Milestone 10 launch.

**3. Snack detail page visibility — corrected after checking the actual seed
data (see below).** All 18 seeded snacks have `is_sellable_individually =
true`; the 4 international imports have `is_byo_eligible = false` instead —
they're excluded from the Build-a-Box picker only (margin protection on
premium imports, per blueprint §2), not from the storefront. So today's seed
data has no row that should 404 on `/shop/snack/[slug]`. The rule itself
still needs building defensively (a future admin-added snack could be
`is_sellable_individually = false`, e.g. a BYO-only filler item): the page
calls `notFound()` for any snack where that flag is false, same treatment as
a nonexistent slug. Task 8's test for this case now inserts one throwaway
non-sellable snack via the admin client rather than relying on seed data
that doesn't exhibit it.

**4. Lighthouse SEO check (roadmap completion criterion).** No Lighthouse CI
tooling exists in this repo yet (`package.json` has none). Adding a full
Lighthouse CI pipeline is a disproportionate lift for one milestone's
acceptance check. Task 9 instead asserts the concrete things Lighthouse's SEO
category actually checks for a detail page (title tag, meta description,
canonical, viewport meta, crawlable links, image alt text) via a Playwright
test reading the rendered `<head>` — same outcome, no new CI dependency. If
you'd rather have real Lighthouse CI wired in, say so and I'll add it as a
follow-up task.

**6. Catalog page ISR vs. filtering.** Next.js opts a page into dynamic,
per-request rendering the moment it reads `searchParams` server-side —
there's no clean way to keep a filterable catalog page fully static. The
roadmap's ISR completion criterion ("editing a box's price ... reflected
within 60s") targets the box/snack *detail* pages (Task 7), not the catalog
list. So: the catalog page still declares `revalidate = 60`, which governs
its unfiltered base view; the moment a request includes `?category=`,
`?tag=`, or `?q=`, that request renders dynamically (fresh data, no 60s
lag) — which is strictly better for a filtered/search view anyway, not a
regression.

**5. Drop demo data.** No `drops` row exists yet (table is empty post-Milestone-1).
Task 3 seeds two: one active (within `starts_at`/`ends_at`, `quantity_limit`
not yet reached) and one sold-out (`units_sold >= quantity_limit`), both
against the existing `random-drop` box, so the completion criterion ("hides
Buy once limit reached") has a real case to test against.

---

## Tasks

Each task: write failing test → implement minimum to pass → confirm green →
commit (per PROJECT_CONSTITUTION §8 TDD default; migrations are scaffolding,
exempted per the same section — their "test" is `supabase db push` /
`migration list` succeeding cleanly).

### Task 1 — Verify existing seed data against the blueprint
- Confirm the 13 boxes' prices/titles match blueprint spec §1 (Price column) exactly.
- Confirm every `box_type = 'build_a_box'` row has a non-null `slot_count`
  matching its size (8/15/25) and every `mystery`/`curated` row has
  `slot_count = null` — a business rule the schema comment documents but
  doesn't enforce via constraint.
- **Test:** `tests/integration/catalog-seed-data.test.ts` — queries `boxes`
  and asserts row count = 13, spot-checks 3 known slugs/prices, asserts no
  `build_a_box` row has a null `slot_count` and no non-`build_a_box` row has
  a non-null one.
- No production code change expected; if the test fails, fix via a new
  migration (never edit the already-applied one).

### Task 2 — Full-text search index
- New migration: `supabase/migrations/<ts>_catalog_fulltext_search.sql`
  - `alter table public.boxes add column search_vector tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))) stored;`
  - `alter table public.snacks add column search_vector tsvector generated always as (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(category,''))) stored;`
  - GIN index on each.
- Regenerate `src/types/supabase.ts` after.
- **Test:** `tests/integration/catalog-search.test.ts` — searching "spicy"
  returns `Spicy Chaos` (box) and `Ghost Pepper Chips`/`Spicy Mango Gummy`
  (snacks); searching a nonsense term returns zero rows; RLS still applies
  (only `active` boxes / all snacks per existing policy).

### Task 3 — Seed demo drops
- New migration: two rows in `drops` against `boxes.slug = 'random-drop'` —
  one active/available, one sold-out. Documented as demo data, same pattern
  as the catalog seed comment header.
- **Test:** integration test asserting the active drop's `units_sold <
  quantity_limit` and the sold-out one's `units_sold >= quantity_limit`.

### Task 4 — Zod validation schemas for catalog queries
- `src/lib/validations/catalog.ts`: schema for list-query params (`category?`,
  `tag?`, `q?` search string, `page?`) — source of truth, types via `z.infer`.
- **Test:** `tests/unit/validations-catalog.test.ts`.

### Task 5 — Catalog data access layer
- `src/lib/supabase/queries/catalog.ts` — server-side read functions:
  `getActiveBoxes()`, `getSellableSnacks(filters)`, `getBoxBySlug(slug)`,
  `getSnackBySlug(slug)`, `getBoxItems(boxId)`, `getActiveDrop(id)`,
  `searchCatalog(query)`. Plain reads via the server Supabase client — no
  Route Handler needed per PROJECT_CONSTITUTION §3 (mobile-readiness
  constraint only applies to *mutations*; a future mobile client reads the
  same RLS-protected tables directly via Supabase's SDK).
- **Test:** integration tests per function against real seeded data.

### Task 6 — Catalog page (`/shop`)
- Replace the placeholder in `src/app/(shop)/shop/page.tsx`.
- Server Component, `export const revalidate = 60`.
- Lists boxes + individually-sellable snacks; category/tag filter chips;
  search input wired to Task 2's index via Task 5's `searchCatalog`.
- Empty state (no results for a filter/search) and `loading.tsx` skeleton
  per PROJECT_CONSTITUTION §5.
- **Test:** Playwright E2E — catalog lists all 13 seeded boxes and 14
  individually-sellable snacks (18 total minus 4 `is_sellable_individually
  = false` international items) with correct prices formatted from cents.

### Task 7 — Box detail page (`/shop/box/[slug]`)
- `src/app/(shop)/shop/box/[slug]/page.tsx`, ISR, `generateMetadata` for
  SEO (title/description/canonical).
- Shows price, description, example contents from `box_items` with a
  "contents rotate weekly, may vary" disclaimer per the blueprint's own
  copy constraint.
- `not-found.tsx` for invalid/non-active slug.
- **Test:** E2E — visiting `/shop/box/munchie-box` renders title/price/
  disclaimer; visiting a nonexistent slug renders the 404 page.
- **ISR proof is a manual verification step, not an automated test.**
  `playwright.config.ts`'s `webServer` runs `npm run dev`, and Next.js
  `revalidate` has no effect in dev mode (dev always renders fresh on every
  request) - an automated test against the dev server would pass whether or
  not ISR is wired correctly, which is worse than no test. To actually prove
  the roadmap's "price change reflected within 60s" criterion:
  1. `npm run build && npm run start` (production mode, ISR active)
  2. Load `/shop/box/munchie-box`, note the price
  3. Update `boxes.price_cents` for that row directly in Supabase
  4. Reload before 60s - old (cached) price still shows
  5. Reload after 60s - new price shows, proving the revalidate window works

**Also confirmed during testing:** visiting a nonexistent box/snack slug
correctly renders the `(shop)/not-found.tsx` content in dev mode, but the
HTTP response status logs as 200, not 404 - a known Next.js/Turbopack dev
server gap (`notFound()`'s status doesn't always propagate correctly before
dev mode's Turbopack starts streaming). E2E tests assert the rendered
content only; the real 404 status should be spot-checked once against a
production build (step 1 above covers both checks in the same session).

### Task 8 — Snack detail page (`/shop/snack/[slug]`)
- `src/app/(shop)/shop/snack/[slug]/page.tsx`, same ISR/metadata pattern.
- Enforces Product Decision #3: `notFound()` when
  `is_sellable_individually = false`.
- **Test:** E2E — a sellable snack renders; a BYO-only/non-sellable snack's
  slug 404s even though the row exists.

### Task 9 — Drop / limited-release page (`/shop/drops/[id]`)
- `src/app/(shop)/shop/drops/[id]/page.tsx` — no slug, per routing spec.
- Countdown to `ends_at` (client component island for the live-updating
  timer; page itself stays a Server Component shell).
- "Buy"/CTA hidden once `units_sold >= quantity_limit` or outside the
  `starts_at`/`ends_at` window.
- **Test:** E2E — the active seeded drop shows a live countdown and a
  visible CTA; the sold-out seeded drop hides the CTA and shows a
  "sold out" state instead.

### Task 10 — SEO assertions (Lighthouse-equivalent, Product Decision #4)
- `tests/e2e/catalog-seo.spec.ts` — on `/shop/box/munchie-box`: asserts a
  non-empty `<title>`, a `meta[name=description]`, a `link[rel=canonical]`,
  a `meta[name=viewport]`, and that every `<img>` has a non-undefined `alt`
  attribute (empty string is acceptable for decorative images per
  PROJECT_CONSTITUTION §5, but the attribute must exist).

### Task 11 — Category/tag browsing polish + final integration pass
- Wire category chips (candy/chips/cookies/spicy/salty/sweet/international)
  and tag filtering into the catalog page's query params (`?category=`,
  `?tag=`), synced with Task 4's schema.
- Full milestone regression: `npm run typecheck && npm run lint && npm run test`.
- Update `docs/superpowers/plans/2026-07-07-v1-milestone-roadmap.md` — no
  content change needed, just confirms Milestone 3 completion criteria are
  now met (checked off in the PR description, not in the file itself).

---

## Completion Criteria (mirrors roadmap, restated for this branch's PR)

- [ ] Catalog lists all 13 seeded boxes and all individually-sellable snacks
      with correct prices
- [ ] Editing a box's price in the DB is reflected on its detail page within
      60s (ISR proof)
- [ ] The active seeded Drop page renders with a live countdown and visible
      CTA; the sold-out seeded Drop correctly hides "Buy"
- [ ] SEO assertions (Task 10) pass on at least one detail page
- [ ] `npm run typecheck && npm run lint && npm run test` all pass
- [ ] No RLS policy changed to make this work — catalog reads use only the
      already-existing public-read policies from Milestone 1

## Out of scope for this milestone (explicitly deferred)

- Real product photography (Milestone 8 admin upload, or a manual pre-launch pass)
- Add-to-cart functionality (Milestone 5)
- Algolia migration (only "once Postgres full-text demonstrably lags" per blueprint §8)
