# SnackBox Platform — Project Constitution

**Status:** Permanent engineering standard. Applies to every milestone branch from Milestone 1 onward.

This document elaborates the specifics `CLAUDE.md` doesn't spell out —
naming, file layout, and conventions. `CLAUDE.md` remains the authority on
business rules, stack choices, and scope; where the two ever conflict,
`CLAUDE.md` governs and this document should be corrected to match.

---

## 0. Business Rules

Technical decisions should always support business objectives. When a
technical choice and a business objective conflict, optimize for the
business before optimizing for engineering elegance.

**Priority order, highest first — canonical source: `CLAUDE.md` § Development Rules, mirrored here for convenience:**

1. Customer Experience
2. Reliability & Trust
3. Revenue Generation
4. Maintainability
5. Performance
6. Developer Convenience

This order governs every section below — e.g. Section 5 (UI Standards)
requires loading/empty/error states because that's a customer-experience
floor, not a nicety; Section 6 (Git Workflow) requires typecheck/lint/test
passing before merge because that's reliability, weighted above the
convenience of skipping the check.

If this list and `CLAUDE.md`'s ever drift apart again, don't silently defer
to one — flag the discrepancy and get it resolved before continuing.

---

## 1. Folder Structure

```
src/
  app/
    (marketing)/          # Public landing, about, faq, contact
    (auth)/                # Sign in, sign up, onboarding
    (shop)/                 # Product discovery, box detail, checkout
    (account)/              # Orders, subscriptions, rewards, referrals, profile
    (admin)/                 # Operations Dashboard, products, orders, customers, analytics
    api/                       # Route Handlers (webhooks, mutations, mobile-ready endpoints)
  components/
    ui/                        # shadcn/ui primitives — never edit directly
    shared/                    # Reusable, feature-agnostic components
    features/                  # Feature-scoped: features/checkout/, features/rewards/, etc.
  lib/
    supabase/                  # server.ts, admin.ts, client.ts
    stripe/                     # Stripe client + webhook handlers
    validations/                 # Zod schemas, shared client/server
  hooks/                          # Custom React hooks
  types/                            # supabase.ts (generated) + hand-written global types
tests/
  unit/                             # Vitest — pure functions, Zod schemas
  integration/                      # Vitest + local Supabase — DB queries, RLS
  e2e/                                # Playwright — critical user flows
supabase/
  migrations/                        # Timestamped SQL migrations
docs/
  superpowers/
    specs/                            # Design specs (brainstorming skill output)
    plans/                             # Implementation plans (writing-plans skill output)
```

**Rules:**
- A file's location signals its scope. Route-group-specific UI stays inside that route group's folder tree; only genuinely cross-route-group components go in `components/shared` or `components/features`.
- Never edit `components/ui/*` — if a primitive needs a variant, wrap it in `components/shared` rather than modifying the copy shadcn generated.
- Test location mirrors test type (`unit`/`integration`/`e2e`), not the file under test's location — do not scatter `*.test.ts` next to source files.

---

## 2. Component Naming

- **File names:** kebab-case, matching shadcn's own convention so the whole `components/` tree is consistent — `product-card.tsx`, not `ProductCard.tsx`.
- **Export names:** PascalCase, matching the component's purpose — `product-card.tsx` exports `ProductCard`.
- **One component per file.** Sub-components used only by one parent may live in the same file; anything reused elsewhere gets its own file.
- **Props types:** named `<ComponentName>Props`, declared directly above the component, not in a separate types file unless shared across multiple components.
- **Hooks:** `use-<name>.ts` file, `use<Name>` export — e.g. `use-cart.ts` exports `useCart`.

---

## 3. API Conventions

- **Location:** `src/app/api/<resource>/route.ts` for collection-level operations, `src/app/api/<resource>/[id]/route.ts` for single-resource operations. Nested resources follow the same pattern (`src/app/api/orders/[id]/tracking/route.ts`).
- **Response shape (mandatory, from CLAUDE.md):**
  ```typescript
  { data: T | null, error: { message: string; code?: string } | null }
  ```
  Never throw an unhandled error to the client; catch and return the `error` shape with an appropriate HTTP status.
- **Mobile-readiness constraint (from the V1 roadmap):** any endpoint that mutates data — checkout, rewards, referrals, inventory, admin actions — lives in a Route Handler, never exclusively inside a page-only Server Action. Route Handlers must not assume a browser/cookie session is the only way in; prefer patterns that also work with a bearer token, since a future mobile client will call the same surface.
- **Validation:** every Route Handler validates its input with a Zod schema from `lib/validations` before touching the database. The schema is the source of truth; request/response TypeScript types are derived with `z.infer`, never hand-written separately.
- **Webhooks:** live under `src/app/api/webhooks/<provider>/route.ts` (e.g. `webhooks/stripe/route.ts`). Always verify the provider's signature before processing. Always idempotent — a webhook handler must safely no-op on a duplicate event ID.
- **Status codes:** `200` success, `201` created, `400` validation error, `401` unauthenticated, `403` unauthorized (RLS/role failure), `404` not found, `409` conflict (e.g. duplicate webhook, race on limited inventory), `500` unexpected server error.

---

## 4. Database Naming Conventions

(Extends `CLAUDE.md`'s baseline: uuid PKs via `gen_random_uuid()`, `created_at`/`updated_at` on every table, RLS everywhere, soft delete via `deleted_at` on orders/boxes/customers.)

- **Table names:** plural, snake_case — `boxes`, `order_items`, `customer_preferences`.
- **Column names:** snake_case — `stripe_customer_id`, `rewards_points`.
- **Foreign keys:** `<referenced_table_singular>_id` — `user_id`, `box_id`, `snack_id`, `order_id`. A table with two FKs to the same referenced table disambiguates by role, not by adding a number: `referrer_id`/`referred_id` on `referrals`, not `user_id_1`/`user_id_2`.
- **Booleans:** prefixed `is_`/`has_` — `is_subscription`, `is_byo_eligible`, `is_sellable_individually`.
- **Money:** stored as integer cents, suffixed `_cents` — `price_cents`, `total_amount_cents`, `unit_price_cents`. Never store money as `numeric`/`float` for a value that gets summed or compared; only `promotions.value` (a percent-or-fixed discount amount, not itself money-to-be-summed) uses `numeric`.
- **Status/category-like fields:** `text` with a `check` constraint listing valid values, not a Postgres `enum` type — enums are painful to extend via migration; a `check` constraint is a one-line migration to update.
- **Timestamps:** `timestamptz`, never bare `timestamp`.
- **Views:** named for what they report, not how — `customer_lifetime_value`, not `orders_aggregated_view`.
- **Junction/log tables:** `<subject>_<verb-or-noun>` — `inventory_events`, `customer_activity`, `audit_logs`, `order_item_snacks`.

---

## 5. UI Standards

- **Tailwind CSS utility-first.** No inline `style=` attributes except for values that are genuinely dynamic and can't be expressed as a Tailwind class (e.g. a computed progress-bar width).
- **shadcn/ui primitives are the base layer.** Compose them in `components/shared`/`components/features`; never fork or hand-edit a file under `components/ui`.
- **Mobile-first responsive design.** Write the unprefixed (mobile) styles first, add `sm:`/`md:`/`lg:` overrides for larger viewports — consistent with the platform's mobile-readiness goal even though V1 ships web-only.
- **Icons:** `lucide-react` (shadcn's default icon set) — don't introduce a second icon library.
- **Loading/empty/error states are not optional.** Every data-fetching UI defines all three, using shadcn's `Skeleton` for loading and a consistent empty-state pattern (icon + short message + primary action where applicable).
- **Accessibility baseline:** every interactive element is keyboard-reachable, every form input has an associated `<label>`, every image has meaningful `alt` text (or `alt=""` if purely decorative).

---

## 6. Git Workflow

- **`main` is production** (per CLAUDE.md) — never commit directly to it.
- **One branch per milestone**, named exactly as the roadmap specifies: `milestone-N-<name>` (e.g. `milestone-1-foundation`). A milestone branch is created as an isolated worktree, per `superpowers:using-git-worktrees`.
- **Out-of-milestone fixes** (a bug found outside current milestone work) use `fix/<short-description>`, branched from `main`.
- **Planning docs** (specs, roadmaps, milestone plans) are committed to `main` directly once approved — they're project-wide reference material, not milestone-scoped code, and every milestone branch needs to see them.
- **Merge, don't squash**, when a milestone branch merges to `main`. The milestone's bite-sized, per-task commit history (one commit per plan task, each independently buildable/testable) is deliberate and worth preserving for future `git blame`/`git bisect` use — squashing throws that away.
- **PRs require** `npm run typecheck && npm run lint && npm run test` passing (per CLAUDE.md), plus the milestone's own completion criteria from its plan, before merge.

---

## 7. Commit Message Conventions

**Conventional Commits**, lowercase type prefix, imperative mood, no period at the end:

```
<type>: <short summary>

[optional body — the WHY, not the WHAT, if non-obvious]
```

**Types:**
- `feat:` — new functionality
- `fix:` — bug fix
- `chore:` — tooling, scaffolding, dependencies, config
- `docs:` — documentation only (specs, plans, README, this constitution)
- `test:` — adding or correcting tests, no production code change
- `refactor:` — restructuring code with no behavior change
- `style:` — formatting only, no logic change

One commit per plan task step-group (matches the bite-sized plan structure — e.g. "write failing test" and "implement" may be separate commits or one, but "commit" is always its own step at the end of a task). Don't bundle unrelated changes into one commit.

---

## 8. Testing Standards

(Extends CLAUDE.md's baseline: Vitest for unit/integration, Playwright for E2E, no mocking the database in integration tests, features aren't complete until tested.)

- **Unit tests** (`tests/unit/*.test.ts`): pure functions, Zod schemas. No I/O.
- **Integration tests** (`tests/integration/*.test.ts`): DB queries and RLS policies, run against a real local Supabase instance (`npx supabase start`) — never a mocked client.
- **E2E tests** (`tests/e2e/*.spec.ts`): Playwright, critical user flows (per CLAUDE.md's five must-work flows) plus each milestone's specific completion-criteria flows.
- **Test output must be pristine** — no stray console warnings, no skipped tests left in as TODOs. A warning in test output is a finding, not noise to ignore.
- **TDD is the default workflow** for any task with production logic: write the failing test, confirm it fails for the expected reason, implement the minimum to pass, confirm it passes, then commit. Pure scaffolding/config tasks (no production logic) are exempt — their "test" is the acceptance command specified in the plan (e.g. `npm run build` succeeding).
- **No hard coverage percentage target.** Every completion criterion in a plan must have a corresponding test; coverage is a byproduct of that, not a separate goal to chase.

---

## 9. Documentation Standards

- **Design specs** live in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (brainstorming skill output) — the product/architecture "what and why."
- **Implementation plans** live in `docs/superpowers/plans/YYYY-MM-DD-<name>.md` (writing-plans skill output) — the "how, in what order."
- **Code comments:** none by default (per CLAUDE.md). Add one only when the *why* is non-obvious — a hidden constraint, a workaround for a specific bug, behavior that would surprise a reader. Never comment *what* the code does; names should already carry that.
- **This constitution is a living document**, but changes to it require the same explicit-approval gate as its creation — a milestone branch's implementer should never amend it unilaterally mid-task. Propose changes, get approval, commit to `main`.
- **README.md** (repo root, not yet created) will hold local setup instructions once Milestone 1's Supabase/env work lands — keep it in sync with actual `npm run`/`supabase` commands, not aspirational ones.
