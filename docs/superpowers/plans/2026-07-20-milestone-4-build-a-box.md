# Milestone 4: Build-A-Box — Implementation Plan

**Date:** 2026-07-20
**Status:** Draft, pending approval
**Branch:** `milestone-4-build-a-box`
**Depends on:** Milestone 3 (catalog data/queries), schema from Milestone 1 (`cart_items`, `cart_item_snacks`, `boxes.box_type = 'build_a_box'`)

Builds the P0 #3 feature from the product blueprint: a fixed-slot-count,
flat-price box where the customer picks which snacks go in it.

---

## Product Decisions (resolved here)

**1. Zustand isn't installed yet.** CLAUDE.md's tech stack calls for it
("Zustand for client state"), and this milestone is the first one that
actually needs client-side state (in-progress slot selections before
submission). Adding it as a new dependency is in scope for this milestone,
not a separate chore.

**2. Scope boundary with Milestone 5 (Cart) - this is the one that needs
your sign-off before I start building.** The roadmap's own completion
criterion for this milestone is "*a completed BYO box's exact snack list is
queryable from the DB after being added to cart*" - but the Cart itself
(page, mixed-cart display, quantity editing) is explicitly Milestone 5's
job, not this one. The schema (`carts`/`cart_items`/`cart_item_snacks`,
Milestone 1) is designed around a specific security pattern: all cart
reads/writes go through `/api/cart/*` Route Handlers using the admin
client, with an anonymous cart identified by a server-generated
`anonymous_id` in an httpOnly cookie - no RLS policy grants direct
anon-key access to a row by `anonymous_id` at all (unreachable by design).

So satisfying this milestone's own completion criterion requires building
*some* real write path into `cart_items`/`cart_item_snacks` now. My plan:
build exactly one Route Handler, `POST /api/cart/items`, that can accept a
build-a-box submission (get-or-create the caller's cart via the
`anonymous_id` cookie, insert one `cart_items` row plus N
`cart_item_snacks` rows). It does **not** get a cart page, quantity
editing, removing items, or mixed-cart display - those stay Milestone 5.
This is the minimum real slice needed to prove the milestone's own
criterion without quietly absorbing Milestone 5's scope.

**3. Snack picker eligibility.** `getSellableSnacks` (Milestone 3) filters
on `is_sellable_individually`, not `is_byo_eligible` - the wrong flag for
this picker. Adding a new query, `getByoEligibleSnacks()`, filtering on
`is_byo_eligible = true` (14 of the 18 seeded snacks; the 4 international
imports are excluded, per the blueprint's margin-protection rule already
verified in Milestone 3).

**4. Slot count is authoritative from the DB, never trusted from the
client.** The Zod schema for the submission accepts a `boxSlug` and a list
of `{ snackId, quantity }`, but the Route Handler re-fetches the box's real
`slot_count` from the database and validates `sum(quantity) === slot_count`
server-side before insert - a client could otherwise submit any count for
any box.

**5. Guest vs. authenticated builder.** Per Milestone 2's guest-checkout
resolution, the builder works without an account. The Route Handler
resolves the caller's cart the same way regardless of auth state: existing
`anonymous_id` cookie → existing cart; authenticated session → cart by
`user_id`; neither → mint a new `anonymous_id`, set the httpOnly cookie,
create the cart.

---

## Tasks

### Task 1 — Add Zustand
- `npm install zustand`
- **Test:** none needed (scaffolding/dependency task, exempt per
  PROJECT_CONSTITUTION §8) - proven by the store actually working in Task 3.

### Task 2 — BYO-eligible snacks query
- Add `getByoEligibleSnacks()` to `src/lib/supabase/queries/catalog.ts`.
- **Test:** integration test - returns 14 snacks, excludes the 4
  international/BYO-ineligible ones.

### Task 3 — Zustand store for in-progress box state
- `src/lib/stores/build-a-box-store.ts`: slot count (from route param),
  selected snacks (`Record<snackId, quantity>`), derived total-picked count,
  add/remove/reset actions.
- **Test:** unit tests - adding exceeds slot count is rejected by the store
  action itself (defense in depth alongside the server-side check), reset
  clears selections, total-picked derivation is correct.

### Task 4 — Zod schema for cart submission
- `src/lib/validations/cart.ts`: `addBuildABoxToCartSchema` -
  `{ boxSlug: string, snacks: Array<{ snackId: string; quantity: number }> }`.
- **Test:** unit tests for valid/invalid shapes (empty snacks array, zero
  quantity, duplicate snackId entries rejected at the schema layer).

### Task 5 — `POST /api/cart/items` Route Handler
- Resolves/creates the cart via `anonymous_id` cookie or session, per
  Product Decision #5.
- Re-fetches the box server-side, validates `box_type = 'build_a_box'` and
  `sum(quantity) === slot_count`, validates every `snackId` has
  `is_byo_eligible = true`, rejects otherwise (`400`).
- Inserts `cart_items` (`item_type = 'box'`) then `cart_item_snacks` rows,
  using the admin client per the schema's documented access pattern.
- Idempotency: not required here (unlike Stripe webhooks) - each submission
  is a new cart line, matching how a real cart works.
- **Test:** integration test - submitting a valid 8-item selection for
  `build-a-box-small` creates exactly one `cart_items` row and 8 (or fewer,
  if quantities >1) `cart_item_snacks` rows summing to 8, queryable
  directly from the DB afterward (the roadmap's actual completion
  criterion). Submitting 7 items for an 8-slot box returns `400`.
  Submitting a BYO-ineligible snack returns `400`.

### Task 6 — Build-a-Box picker UI (`/shop/build-a-box`)
- `src/app/(shop)/shop/build-a-box/page.tsx` - size selector (small/medium/
  large, reads the three seeded boxes), then snack grid using Task 2's
  query, quantity steppers wired to Task 3's store, running
  picked-count/slot-count indicator, submit disabled until the count
  matches exactly.
- Loading/empty states per PROJECT_CONSTITUTION §5.
- **Test:** E2E - picking exactly 8 items for Small enables submit and
  successfully posts; picking 7 keeps submit disabled with a visible
  count indicator; a BYO-ineligible snack never appears in the grid.

### Task 7 — Final integration pass
- `npm run typecheck && npm run lint && npm run test`, plus the Playwright
  suite.

---

## Completion Criteria (mirrors roadmap)

- [ ] User can build an exactly-8/15/25-item box; submission blocked on
      wrong count (enforced in both the UI and the Route Handler)
- [ ] Snacks flagged `is_byo_eligible = false` never appear in the picker
- [ ] A completed BYO box's exact snack list is queryable from the DB
      after being added to cart
- [ ] `npm run typecheck && npm run lint && npm run test` all pass

## Explicitly out of scope (Milestone 5's job)

- Cart page / viewing what's in the cart
- Editing quantities or removing items after adding
- Mixed-cart display (boxes + snacks + BYO boxes together)
- Cart total calculation
