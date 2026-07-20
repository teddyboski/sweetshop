# Milestone 5: Shopping Cart — Implementation Plan

**Date:** 2026-07-20
**Status:** Complete - all tasks implemented, full checkpoint (typecheck,
lint, 110 vitest tests, 36 Playwright e2e tests) passing
**Branch:** `milestone-5-shopping-cart`
**Depends on:** Milestone 3 (catalog), Milestone 4 (BYO cart-write path, `cart_items`/`cart_item_snacks`)

Builds the cart itself: viewing what's in it, adjusting quantities, removing
items, and a correct running total across curated boxes, individual snacks,
and Build-a-Box selections in one mixed cart.

---

## Product Decisions

**1. Cart persistence is DB-backed, not localStorage - this supersedes the
roadmap's original phrasing.** The roadmap describes "Zustand, persisted to
localStorage pre-auth, synced to the account post-auth." That predates
Milestone 1's actual schema, which deliberately built `carts`/`cart_items`/
`cart_item_snacks` with a server-generated `anonymous_id` in an httpOnly
cookie specifically so the cart is never client-tamperable and survives
without relying on `localStorage` (which is lost on a different device/
browser, and readable/writable by any script on the page). Milestone 4
already built and tested this exact mechanism for Build-a-Box submissions.
This milestone extends the *same* mechanism to boxes and snacks - no
`localStorage`, no client-side cart-contents state at all. Zustand's role
here is narrow: purely ephemeral UI state (e.g. "is the cart drawer open"),
not cart contents. If you'd rather I flag this upward as a CLAUDE.md/
constitution correction (the roadmap doc still says localStorage), I can do
that too - but the actual schema and Milestone 4's working code already
made this call.

**2. `POST /api/cart/items` (Milestone 4) is extended, not duplicated.**
Rather than a second endpoint, its Zod schema becomes a discriminated union
on `itemType`: `"build_a_box"` (existing behavior, unchanged) | `"box"`
(curated/mystery box, `{ boxSlug, quantity }`) | `"snack"` (`{ snackId,
quantity }`, must be `is_sellable_individually = true`). One endpoint, one
cart-resolution code path, per PROJECT_CONSTITUTION's "don't abstract
prematurely" balanced against "don't duplicate a whole route for a
one-field difference."

**3. Cart reads don't need a Route Handler.** Per PROJECT_CONSTITUTION §3,
the mobile-readiness constraint applies to *mutations* - reading the cart's
contents for display is a plain server-side query (`getCart()`), same
pattern as Milestone 3's catalog queries, using the admin client since (per
the schema's own design) no RLS policy grants anon-key access to a cart row
by `anonymous_id` at all.

**4. New mutations needed:** `PATCH /api/cart/items/[id]` (quantity change,
box/snack lines only) and `DELETE /api/cart/items/[id]` (any line type,
including build-a-box). Both re-verify the cart_item belongs to the
caller's own cart (via the same session/cookie resolution as Milestone 4)
before mutating - never trust a client-supplied cart_item id alone.

**5. Build-a-Box lines are remove-only, not quantity-adjustable.** Each
Build-a-Box submission is its own cart line at quantity 1 (per Milestone
4). Incrementing its quantity would require duplicating the entire
`cart_item_snacks` selection with no clear UX benefit over "build another
one" - so the cart page shows a Remove button for these lines, no quantity
stepper. `PATCH` rejects attempts to change quantity on a `build_a_box`
line with `400`.

**6. Shipping rule for snack-only carts (the roadmap's open decision #5) -
approved 2026-07-20.** A cart containing **no box item at all** (only loose
snacks) requires a **$25 minimum order value**, or has a **flat $5 shipping
fee added** if under that threshold. Carts containing at least one box ship
free (bundled into the box price, per CLAUDE.md). Mirrored in the roadmap
doc's Milestone 5 section.

**7. Total is computed live at read time, not snapshotted in the cart.**
`orders.total_amount_cents` (Milestone 6) is the point-in-time snapshot;
while still *in the cart*, prices reflect the current `boxes.price_cents`/
`snacks.price_cents`, consistent with how the roadmap's ISR pages already
work (a price change should show up), and consistent with never trusting
stale client-cached prices at checkout time later.

---

## Tasks

### Task 1 — Extend the cart-item Zod schema to a discriminated union
- `src/lib/validations/cart.ts`: `addToCartSchema` = discriminated union on
  `itemType` (`build_a_box` | `box` | `snack`), replacing
  `addBuildABoxToCartSchema` as the Route Handler's schema (keep the old
  export as a type alias for backward compatibility with Milestone 4's
  tests, or update those tests to the new shape - whichever keeps the test
  suite honest, decided during implementation).
- **Test:** unit tests per variant, plus rejection of a `box` submission
  with a `snackId` field (wrong shape for that discriminant) and vice versa.

### Task 2 — Extend `POST /api/cart/items` for box and snack items
- Adds the `box` and `snack` branches: fetch the box/snack server-side,
  validate `status = 'active'` (box) or `is_sellable_individually = true`
  (snack), insert a single `cart_items` row with the given quantity. No
  `cart_item_snacks` rows for these two branches (only build_a_box gets
  those).
- **Test:** integration - adding a curated box and an individual snack each
  create exactly one correct `cart_items` row; adding a `draft`/`archived`
  box, or a non-individually-sellable snack, returns `400`.

### Task 3 — `getCart()` query + cart total calculation
- `src/lib/supabase/queries/cart.ts`: resolves the caller's cart (same
  session/cookie logic as the Route Handler, factored into a shared
  helper), returns all `cart_items` joined with their box/snack data (live
  price) and, for build-a-box lines, their `cart_item_snacks` with snack
  names.
- A pure function `calculateCartTotal(items)` - unit-testable without a DB
  round trip, since correctness of a 1-box + 2-snacks + 1-BYO-box total
  (the roadmap's own completion criterion) shouldn't require hitting
  Supabase to verify.
- **Test:** unit test for `calculateCartTotal` against a hand-built mixed
  cart; integration test that `getCart()` returns the right shape against a
  real cart with all three item types.

### Task 4 — `PATCH` / `DELETE /api/cart/items/[id]`
- `PATCH`: body `{ quantity }`, rejects `item_type = 'box' with parent
  box_type = 'build_a_box'` (Product Decision #5) and any quantity `< 1`
  (use DELETE to remove instead of quantity 0).
- `DELETE`: removes the `cart_items` row (cascades to `cart_item_snacks`
  automatically per the schema's `on delete cascade`).
- Both verify cart ownership (session or anonymous cookie) before acting -
  a cart_item id alone is not enough authorization.
- **Test:** integration - updating another cart's item returns `404` (not
  `403`, to avoid revealing the id exists in someone else's cart); quantity
  update changes the row; delete removes it and its `cart_item_snacks`.

### Task 5 — Shipping rule enforcement
- Implemented in `calculateCartTotal` (Task 3): if the cart contains zero
  `item_type = 'box'` lines (curated, mystery, or build_a_box - any box)
  and the subtotal is under $25, add a flat $5 shipping line to the total.
  Any box present, or a snack-only subtotal of $25+, ships free.
- **Test:** unit tests - snack-only cart under $25 gets the $5 fee added;
  snack-only cart at/over $25 does not; mixed cart with any box present
  never gets the fee regardless of subtotal.

### Task 6 — Cart page (`/shop/cart`)
- `src/app/(shop)/shop/cart/page.tsx`: lists all three line types, quantity
  steppers for box/snack lines, remove buttons for all lines, running
  total, empty-cart state, loading skeleton.
- **Test:** E2E - adding a box then a snack then completing a Build-a-Box
  all show up together in the cart with a correct combined total; removing
  a line updates the total; a page reload preserves the cart (via the
  `anonymous_cart_id` cookie, proving the roadmap's "cart persists across
  reload" criterion without any localStorage involved).

### Task 7 — Final integration pass
- `npm run typecheck && npm run lint && npm run test`, full Playwright
  suite.

---

## Completion Criteria (mirrors roadmap)

- [x] Cart total is correct for a mixed cart (1 box + 2 loose snacks + 1
      BYO box)
- [x] A snack-only cart under the resolved threshold either blocks
      checkout with a clear message or applies the resolved shipping fee
- [x] Cart persists across a page reload (via the DB-backed anonymous
      cart, not localStorage - see Product Decision #1)
- [x] `npm run typecheck && npm run lint && npm run test` all pass, plus
      the full Playwright e2e suite (36/36)

## Explicitly out of scope (Milestone 6's job)

- Actual checkout / Stripe
- Inventory reservation at add-to-cart or checkout time
- Cart abandonment handling beyond what the `carts.status` enum already supports
