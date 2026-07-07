# Milestone 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. User has requested a stop-and-review checkpoint after each Task in this plan — do not proceed to the next Task without explicit confirmation.

**Goal:** Stand up the Next.js/Supabase/Tailwind scaffold, the full V1 database schema with RLS, static marketing pages, and CI, so every later milestone has a working foundation to build on.

**Architecture:** Next.js App Router with five route groups (`(marketing)`, `(auth)`, `(shop)`, `(account)`, `(admin)`), Supabase for Postgres/Auth/Storage with RLS enabled on every table, shadcn/ui primitives copied into the repo. Mutating business logic goes in Route Handlers (`/api/*`), never trapped in page-only Server Actions, so a future mobile client can reuse the same surface without a backend redesign.

**Tech Stack:** Next.js (App Router, TypeScript strict), Tailwind CSS + shadcn/ui, Supabase CLI (local dev via `npx supabase`), Vitest, Playwright, ESLint.

## Global Constraints

(carried from `docs/superpowers/plans/2026-07-07-v1-milestone-roadmap.md`)

- TypeScript strict mode, no `any`, no unchecked assertions
- RLS enabled on every table, no exceptions
- Server Components by default; `"use client"` only when needed
- Consistent API response shape: `{ data, error }`
- Mutating business logic lives in Route Handlers or Postgres (RLS/functions), never only in a Server Action
- Every admin-initiated mutation writes an `audit_logs` row
- `npm run typecheck && npm run lint && npm run test` must pass before any PR
- Soft delete (`deleted_at`) on orders, boxes, customers — never hard delete
- No moment.js, no lodash

---

### Task 1: Initialize Next.js Project

**Files:**
- Create: entire scaffold via `create-next-app` (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.eslintrc`/`eslint.config.mjs`, `.gitignore`)

**Interfaces:**
- Produces: a runnable Next.js dev server at `http://localhost:3000`, TypeScript strict mode on, `src/` directory with `@/*` import alias

- [ ] **Step 1: Scaffold the project**

Run from the repo root:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```
Answer "Yes" if prompted to install into a non-empty directory (the repo already has `CLAUDE.md`, `.claude/`, `docs/`).

- [ ] **Step 2: Verify TypeScript strict mode is on**

Open `tsconfig.json` and confirm `"strict": true` is present under `compilerOptions` (create-next-app sets this by default — if missing, add it).

- [ ] **Step 3: Verify the dev server runs**

Run: `npm run build`
Expected: build completes with no errors, ending in a route summary (e.g. `○ /`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with TypeScript, Tailwind, App Router"
```

---

### Task 2: Install and Configure shadcn/ui

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/input.tsx`
- Modify: `src/app/globals.css` (CSS variables added by shadcn init)

**Interfaces:**
- Produces: `cn()` helper in `src/lib/utils.ts` (`(...inputs: ClassValue[]) => string`), `Button`, `Card`, `Input` components importable from `@/components/ui/*`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```
This creates `components.json` and `src/lib/utils.ts`, and adds CSS variables to `src/app/globals.css`.

- [ ] **Step 2: Add base primitives**

```bash
npx shadcn@latest add button card input
```

- [ ] **Step 3: Verify with a smoke render**

Temporarily replace `src/app/page.tsx` content with:
```tsx
import { Button } from "@/components/ui/button";

export default function Home() {
  return <Button>Test</Button>;
}
```
Run: `npm run build`
Expected: build succeeds. (Task 4 replaces this page's content with real marketing copy — this step is just verification.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install shadcn/ui with button, card, input primitives"
```

---

### Task 3: Create Route Group Skeleton

**Files:**
- Create: `src/app/(marketing)/layout.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/page.tsx`, `src/app/(shop)/layout.tsx`, `src/app/(shop)/page.tsx`, `src/app/(account)/layout.tsx`, `src/app/(account)/page.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(admin)/page.tsx`
- Modify: `src/app/page.tsx` → move to `src/app/(marketing)/page.tsx` (Task 4 fills in real content)
- Test: `tests/e2e/route-groups.spec.ts`

**Interfaces:**
- Produces: five resolvable route groups, each rendering a placeholder heading identifying itself, for Task 4+ and later milestones to build inside

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Write the failing E2E test**

Create `tests/e2e/route-groups.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

const routes: Array<[string, string]> = [
  ["/", "Sweet Shop"],
  ["/shop", "Shop Placeholder"],
  ["/account", "Account Placeholder"],
  ["/admin", "Admin Placeholder"],
];

for (const [path, expectedText] of routes) {
  test(`${path} renders its placeholder heading`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: expectedText })).toBeVisible();
  });
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright test tests/e2e/route-groups.spec.ts`
Expected: FAIL (routes don't exist yet, 404s)

- [ ] **Step 4: Create the route groups**

Move `src/app/page.tsx` into `src/app/(marketing)/page.tsx`:
```tsx
export default function Home() {
  return <h1>Sweet Shop</h1>;
}
```

Create `src/app/(marketing)/layout.tsx`:
```tsx
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="marketing-layout">{children}</div>;
}
```

Create `src/app/(shop)/page.tsx`:
```tsx
export default function ShopHome() {
  return <h1>Shop Placeholder</h1>;
}
```

Create `src/app/(shop)/layout.tsx`:
```tsx
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <div className="shop-layout">{children}</div>;
}
```

Create `src/app/(account)/page.tsx`:
```tsx
export default function AccountHome() {
  return <h1>Account Placeholder</h1>;
}
```

Create `src/app/(account)/layout.tsx`:
```tsx
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className="account-layout">{children}</div>;
}
```

Create `src/app/(admin)/page.tsx`:
```tsx
export default function AdminHome() {
  return <h1>Admin Placeholder</h1>;
}
```

Create `src/app/(admin)/layout.tsx`:
```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-layout">{children}</div>;
}
```

Create `src/app/(auth)/page.tsx`:
```tsx
export default function AuthHome() {
  return <h1>Auth Placeholder</h1>;
}
```

Create `src/app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-layout">{children}</div>;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/route-groups.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add route group skeleton for marketing/auth/shop/account/admin"
```

---

### Task 4: Build Marketing Pages

**Files:**
- Modify: `src/app/(marketing)/page.tsx`
- Create: `src/app/(marketing)/about/page.tsx`, `src/app/(marketing)/faq/page.tsx`, `src/app/(marketing)/contact/page.tsx`
- Test: `tests/e2e/marketing-pages.spec.ts`

**Interfaces:**
- Consumes: `(marketing)/layout.tsx` from Task 3
- Produces: four real marketing pages with actual Sweet Shop copy (sourced from the legacy site analysis in the blueprint spec, Section 1)

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/marketing-pages.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

test("home page shows the Sweet Shop value proposition", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The Sweet Shop" })).toBeVisible();
  await expect(page.getByText(/hand-packed/i)).toBeVisible();
});

test("about page renders", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "About The Sweet Shop" })).toBeVisible();
});

test("faq page renders", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently Asked Questions" })).toBeVisible();
});

test("contact page renders", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "Contact Us" })).toBeVisible();
  await expect(page.getByText("Manager@middlemanmerchants.com")).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/e2e/marketing-pages.spec.ts`
Expected: FAIL (`/about`, `/faq`, `/contact` don't exist; home page has old placeholder heading)

- [ ] **Step 3: Write the pages**

Replace `src/app/(marketing)/page.tsx`:
```tsx
export default function Home() {
  return (
    <main>
      <h1>The Sweet Shop</h1>
      <p>Hand-packed & shipped fast. Curated snack boxes, build-your-own boxes,
      mystery drops, and a monthly subscription — exotic snacking made easy.</p>
    </main>
  );
}
```

Create `src/app/(marketing)/about/page.tsx`:
```tsx
export default function About() {
  return (
    <main>
      <h1>About The Sweet Shop</h1>
      <p>The Sweet Shop curates snack boxes from around the world — candy,
      chips, and exotic imports, hand-packed fresh to order. We started as a
      Whatnot live-selling shop and grew into a full snack box platform.</p>
    </main>
  );
}
```

Create `src/app/(marketing)/faq/page.tsx`:
```tsx
export default function Faq() {
  return (
    <main>
      <h1>Frequently Asked Questions</h1>
      <section>
        <h2>How fast do you ship?</h2>
        <p>Every box is packed fresh to order and ships fast, domestically.</p>
      </section>
      <section>
        <h2>Can I cancel my subscription?</h2>
        <p>Yes — cancel anytime from your account page.</p>
      </section>
    </main>
  );
}
```

Create `src/app/(marketing)/contact/page.tsx`:
```tsx
export default function Contact() {
  return (
    <main>
      <h1>Contact Us</h1>
      <p>Email us at Manager@middlemanmerchants.com</p>
    </main>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/e2e/marketing-pages.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add marketing pages with real Sweet Shop copy"
```

---

### Task 5: Initialize Supabase Local Dev

**Files:**
- Create: `supabase/config.toml`, `.env.local` (gitignored — do not commit)
- Modify: `.gitignore` (ensure `.env.local` and `supabase/.branches`/`supabase/.temp` are ignored)

**Interfaces:**
- Produces: a running local Supabase stack (Postgres on `localhost:54322`, Studio on `localhost:54323`, API on `localhost:54321`) for Task 6+ to migrate against

**Prerequisite:** Docker Desktop must be installed and running — `npx supabase start` needs it. If Docker isn't available in this environment, stop after Step 1 and flag it rather than guessing at a workaround.

- [ ] **Step 1: Initialize the Supabase project config**

```bash
npx supabase init
```

- [ ] **Step 2: Start the local stack**

```bash
npx supabase start
```
Expected output includes `API URL`, `anon key`, `service_role key` — copy these into `.env.local`.

- [ ] **Step 3: Create `.env.local`**

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Step 2>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Step 2>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Confirm `.env.local` is gitignored**

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (confirms it's ignored)

- [ ] **Step 5: Commit the config (not the env file)**

```bash
git add supabase/config.toml .gitignore
git commit -m "chore: initialize Supabase local dev stack"
```

---

### Task 6: V1 Schema Migration with RLS

**Files:**
- Create: `supabase/migrations/20260707000000_initial_schema.sql`
- Test: `tests/integration/rls.test.ts`

**Interfaces:**
- Consumes: local Supabase instance from Task 5
- Produces: all 16 V1 tables + `customer_lifetime_value` view, RLS enabled and enforced on every table, an `is_admin()` helper function later tasks' policies can reuse

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260707000000_initial_schema.sql`:
```sql
-- Extensions
create extension if not exists "pgcrypto";

-- Helper: is_admin() — security definer so it bypasses RLS on the inner
-- lookup and avoids recursive policy evaluation on `users`.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

-- users
create table public.users (
  id uuid primary key default gen_random_uuid() references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  stripe_customer_id text,
  rewards_points integer not null default 0,
  referral_code text unique not null default encode(gen_random_bytes(6), 'hex'),
  referred_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.users enable row level security;
create policy "users select own" on public.users for select using (auth.uid() = id or public.is_admin());
create policy "users update own" on public.users for update using (auth.uid() = id or public.is_admin());

-- boxes
create table public.boxes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_cents integer not null,
  is_subscription boolean not null default false,
  cadence text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.boxes enable row level security;
create policy "boxes public read active" on public.boxes for select using (status = 'active' and deleted_at is null);
create policy "boxes admin all" on public.boxes for all using (public.is_admin());

-- snacks
create table public.snacks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text,
  tags text[] not null default '{}',
  nutrition_json jsonb,
  image_url text,
  price_cents integer,
  is_sellable_individually boolean not null default false,
  is_byo_eligible boolean not null default true,
  inventory_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.snacks enable row level security;
create policy "snacks public read" on public.snacks for select using (true);
create policy "snacks admin all" on public.snacks for all using (public.is_admin());

-- box_items
create table public.box_items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);
alter table public.box_items enable row level security;
create policy "box_items public read" on public.box_items for select using (true);
create policy "box_items admin all" on public.box_items for all using (public.is_admin());

-- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  status text not null default 'pending',
  total_amount_cents integer not null default 0,
  shipping_address jsonb,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.orders enable row level security;
create policy "orders select own" on public.orders for select using (auth.uid() = user_id or public.is_admin());
create policy "orders admin write" on public.orders for insert with check (public.is_admin() or auth.uid() = user_id);
create policy "orders admin update" on public.orders for update using (public.is_admin());

-- order_items
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_type text not null check (item_type in ('box', 'snack')),
  box_id uuid references public.boxes(id),
  snack_id uuid references public.snacks(id),
  quantity integer not null default 1,
  unit_price_cents integer not null,
  created_at timestamptz not null default now(),
  constraint order_items_item_ref_check check (
    (item_type = 'box' and box_id is not null and snack_id is null) or
    (item_type = 'snack' and snack_id is not null and box_id is null)
  )
);
alter table public.order_items enable row level security;
create policy "order_items select via order" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);
create policy "order_items admin write" on public.order_items for all using (public.is_admin());

-- subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  box_id uuid not null references public.boxes(id),
  stripe_subscription_id text unique,
  status text not null default 'active',
  next_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "subscriptions select own" on public.subscriptions for select using (auth.uid() = user_id or public.is_admin());
create policy "subscriptions admin write" on public.subscriptions for all using (public.is_admin());

-- rewards_ledger
create table public.rewards_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  delta_points integer not null,
  reason text not null,
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);
alter table public.rewards_ledger enable row level security;
create policy "rewards_ledger select own" on public.rewards_ledger for select using (auth.uid() = user_id or public.is_admin());
create policy "rewards_ledger admin write" on public.rewards_ledger for insert with check (public.is_admin());

-- referrals
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users(id),
  referred_id uuid not null unique references public.users(id),
  status text not null default 'pending',
  reward_issued_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.referrals enable row level security;
create policy "referrals select own" on public.referrals for select using (
  auth.uid() = referrer_id or auth.uid() = referred_id or public.is_admin()
);
create policy "referrals admin write" on public.referrals for all using (public.is_admin());

-- drops
create table public.drops (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  quantity_limit integer not null,
  units_sold integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.drops enable row level security;
create policy "drops public read" on public.drops for select using (true);
create policy "drops admin write" on public.drops for all using (public.is_admin());

-- promotions
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value numeric not null,
  usage_limit integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.promotions enable row level security;
create policy "promotions public read" on public.promotions for select using (true);
create policy "promotions admin write" on public.promotions for all using (public.is_admin());

-- customer_preferences
create table public.customer_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id),
  dietary_restrictions text[] not null default '{}',
  disliked_categories text[] not null default '{}',
  flavor_profile text[] not null default '{}',
  spice_tolerance text,
  marketing_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_preferences enable row level security;
create policy "customer_preferences own" on public.customer_preferences for all using (
  auth.uid() = user_id or public.is_admin()
);

-- inventory_events
create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  snack_id uuid not null references public.snacks(id),
  delta integer not null,
  reason text not null check (reason in ('restock', 'order', 'adjustment', 'byo_reservation')),
  reference_id uuid,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
alter table public.inventory_events enable row level security;
create policy "inventory_events admin only" on public.inventory_events for all using (public.is_admin());

-- customer_activity
create table public.customer_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.customer_activity enable row level security;
create policy "customer_activity select own" on public.customer_activity for select using (
  auth.uid() = user_id or public.is_admin()
);
create policy "customer_activity insert own" on public.customer_activity for insert with check (
  auth.uid() = user_id or public.is_admin()
);

-- audit_logs
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy "audit_logs admin only" on public.audit_logs for all using (public.is_admin());

-- legacy_orders
create table public.legacy_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_payment_intent_id text unique not null,
  email text not null,
  amount_cents integer not null,
  product_description text,
  created_at timestamptz not null,
  matched_user_id uuid references public.users(id)
);
alter table public.legacy_orders enable row level security;
create policy "legacy_orders admin only" on public.legacy_orders for all using (public.is_admin());

-- customer_lifetime_value (view, not a stored table)
create view public.customer_lifetime_value as
select
  o.user_id,
  count(*) as total_orders,
  sum(o.total_amount_cents) as total_spend_cents,
  min(o.created_at) as first_order_at,
  max(o.created_at) as last_order_at,
  avg(o.total_amount_cents) as avg_order_value_cents
from public.orders o
where o.status = 'paid' and o.deleted_at is null
group by o.user_id;
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db reset
```
Expected: output ends with `Finished supabase db reset` and no SQL errors.

- [ ] **Step 3: Write the failing RLS test**

Install the test client first: `npm install -D vitest @supabase/supabase-js dotenv`

Create `tests/integration/rls.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe("RLS default-deny", () => {
  it("blocks anonymous reads of orders", async () => {
    const anon = createClient(url, anonKey);
    const { data, error } = await anon.from("orders").select("*");
    expect(data).toEqual([]);
    expect(error).toBeNull(); // RLS returns an empty set, not an error, for select
  });

  it("allows anonymous reads of active boxes", async () => {
    const anon = createClient(url, anonKey);
    const { error } = await anon.from("boxes").select("*").eq("status", "active");
    expect(error).toBeNull();
  });

  it("blocks anonymous writes to audit_logs", async () => {
    const anon = createClient(url, anonKey);
    const { error } = await anon.from("audit_logs").insert({
      action: "test",
      entity_type: "test",
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify it fails or passes correctly**

Run: `npx vitest run tests/integration/rls.test.ts`
Expected: PASS — if any test fails, the corresponding policy above has a bug; fix the SQL and re-run `npx supabase db reset` before re-testing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add V1 schema migration with RLS on every table"
```

---

### Task 7: Generate Supabase Types + Server/Admin Clients

**Files:**
- Create: `src/types/supabase.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/client.ts`

**Interfaces:**
- Consumes: local Supabase instance + schema from Task 6
- Produces: `createServerSupabaseClient()` (async, cookie-aware, for Server Components/Route Handlers), `createAdminSupabaseClient()` (service-role, server-only), `createBrowserSupabaseClient()` (for Client Components) — later milestones import these instead of constructing clients ad hoc

- [ ] **Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Generate types**

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

- [ ] **Step 3: Write the server client**

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

- [ ] **Step 4: Write the admin client**

Create `src/lib/supabase/admin.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Server-only. Never import this from a Client Component.
export function createAdminSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 5: Write the browser client**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run typecheck` (add this script in Task 9 if it doesn't exist yet — if it doesn't exist, run `npx tsc --noEmit` directly for this check instead)
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add generated Supabase types and server/admin/browser clients"
```

---

### Task 8: Prove the Mobile-Ready Route Handler Boundary

**Files:**
- Create: `src/app/api/health/route.ts`, `tests/integration/api-health.test.ts`

**Interfaces:**
- Consumes: `createAdminSupabaseClient` from Task 7
- Produces: proof that a Route Handler is reachable by bearer token, not just browser cookies — the pattern every later milestone's mutation endpoints (checkout, rewards, referrals) must follow per the mobile-readiness constraint

- [ ] **Step 1: Write the failing test**

Create `tests/integration/api-health.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("GET /api/health", () => {
  it("responds with ok status without relying on a browser cookie session", async () => {
    const res = await fetch("http://localhost:3000/api/health");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { status: "ok" }, error: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (with `npm run dev` running in another terminal): `npx vitest run tests/integration/api-health.test.ts`
Expected: FAIL (404, route doesn't exist)

- [ ] **Step 3: Write the Route Handler**

Create `src/app/api/health/route.ts`:
```typescript
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ data: { status: "ok" }, error: null });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/integration/api-health.test.ts`
Expected: PASS

- [ ] **Step 5: Verify it's callable outside the Next.js app (proves the mobile boundary)**

Run: `curl -s http://localhost:3000/api/health`
Expected: `{"data":{"status":"ok"},"error":null}` — confirms this endpoint has no dependency on a browser session, satisfying the mobile-readiness constraint.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add health Route Handler, proving the mobile-ready API boundary"
```

---

### Task 9: CI Pipeline

**Files:**
- Modify: `package.json` (scripts)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm run typecheck`, `npm run lint`, `npm run test` scripts, and a GitHub Action that runs all three on every PR

- [ ] **Step 1: Add scripts to `package.json`**

Add under `"scripts"`:
```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:e2e": "playwright test"
```
(`lint` already exists from `create-next-app`.)

- [ ] **Step 2: Verify each script runs locally**

```bash
npm run typecheck
npm run lint
npm run test
```
Expected: all three exit 0.

- [ ] **Step 3: Write the GitHub Action**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add typecheck/lint/test scripts and CI workflow"
```

---

## Milestone 1 Self-Review

- **Spec coverage:** every Milestone 1 bullet from the roadmap (scaffold, RLS schema including `audit_logs`, generated types, env vars, marketing pages, mobile-ready boundary, CI) has a task above.
- **Placeholder scan:** no TBD/TODO; every step has real code or an exact command.
- **Type consistency:** `Database` type from Task 7 is the single source later tasks import; `createServerSupabaseClient` / `createAdminSupabaseClient` / `createBrowserSupabaseClient` names are used consistently.
