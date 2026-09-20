# Scan-to-15%-off Welcome Offer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer who signs up through the QR sticker (`/scan` → signup) gets 15% off their first order, applied automatically at checkout, once per customer — plus the printable sticker artwork.

**Architecture:** Schema-only migration (`promotions.first_order_only`, `profiles.signup_offer_code`, `promotion_redemptions`, updated signup trigger and profile guard). One shared `resolvePromotion` (pure decision function + thin DB loader) replaces the two duplicated promo blocks in `/api/checkout/session` and `/api/checkout/payment-intent` and adds the first-order rules and auto-apply. The Stripe webhook records a redemption after payment confirms. A static `/scan` page and the cart page surface the offer. A script generates the label artwork.

**Tech Stack:** Next.js 16 (App Router) · Supabase (shared free-tier project, no local Docker) · Stripe (test mode) · Zod · Vitest (unit + integration, no DB mocks) · Playwright · `qrcode`/`jsqr`/`pngjs` (dev only).

Spec: `docs/superpowers/specs/2026-09-20-scan-offer-design.md` (approved).

## Global Constraints

- Follow `CLAUDE.md` and `PROJECT_CONSTITUTION.md`: TypeScript strict, no `any`; Zod validates route input; response shape `{ data, error }`; money is integer cents; RLS on every table; kebab-case files; **no comments unless the WHY is non-obvious**; Conventional Commits (`feat:`, `test:`, `fix:`, `chore:`, `docs:`), lowercase, imperative, no trailing period; every commit message ends with the line `Co-Authored-By: <your model name> <noreply@anthropic.com>`; never `--no-verify`.
- Work ONLY in the milestone worktree `C:\Users\sbutl\Projects\sweetshop-milestone-25` (branch `milestone-25-scan-offer`). Never touch `C:\Users\sbutl\Projects\sweetshop` (its `main` working tree carries Ted's uncommitted `mobile/app.json`). Stage explicit paths only (`git add <paths>`), never `git add -A`.
- **Never apply the migration and never create the `SCAN15` promotion yourself.** Both touch the shared Supabase project and are controller/Ted-gated. Do not run `supabase db push`, `scripts/create-scan-offer-promo.ts`, or any script/test that inserts a `SCAN15` row.
- Existing behaviour must not change: a typed, ordinary (non-`first_order_only`) promo code behaves exactly as before, including the exact error string `That promo code isn't valid` and the 400 status. `checkout-session-route.test.ts`, `checkout-payment-intent-route.test.ts` and `checkout-webhook-route.test.ts` existing tests must keep passing untouched (you only ADD tests and extend their `seedPromotion` helpers).
- Discount amount is computed only on the server from the authenticated session, as `round(cart.subtotalCents × value / 100)` for percent promos (shipping excluded) — unchanged from today.
- Test data: unique per test (`crypto.randomUUID()` suffixes), cleaned up in `afterEach`/`afterAll`; the shared DB must be left as found. Test output must be pristine (no stray warnings).
- Vitest server-side files start with `// @vitest-environment node`. Integration tests hit the real shared Supabase and real Stripe test mode (see `.env.local`); they run one file at a time (`npx vitest run <file>`) and can take a minute.
- Before each commit run `npm run typecheck` and the task's named tests; run `npm run lint` before the last commit of any task that adds `.mjs`/`.ts` files.
- **Shell rule:** run every test command directly in the foreground and wait for it (Bash timeout 600000). Do NOT background it, tail it, or end your turn while "waiting". Edit files with the Edit tool; do not rewrite files through Python/`sed`/PowerShell (line-ending damage).

## Controller-only setup and gates (not implementer tasks)

- **Setup (before Task 1):** from `C:\Users\sbutl\Projects\sweetshop` run `git worktree add ..\sweetshop-milestone-25 -b milestone-25-scan-offer main`; copy `.env.local` into the worktree; in the worktree run `npm ci`. Base commit = `git rev-parse HEAD` of `main`.
- **Gate A (after Task 1, before Task 2):** ask Ted to apply `supabase/migrations/20260920120000_scan_offer.sql` to the shared Supabase project himself (the controller never handles the DB password): `npx supabase db push --db-url "<his connection string>"` run in the worktree. Then verify with a service-role read (`profiles.signup_offer_code`, `promotions.first_order_only`, `promotion_redemptions` all selectable). Nothing after this gate that needs the DB runs until it passes.
- **Gate B (after the merge, after deploy):** ask Ted before running `npx tsx --env-file=.env.local scripts/create-scan-offer-promo.ts` (Task 10) against production data; only then is the label safe to print.

---

### Task 1: Schema migration and generated types

**Files:**
- Create: `supabase/migrations/20260920120000_scan_offer.sql`
- Modify: `src/types/supabase.ts`

**Interfaces:**
- Produces (used by later tasks): `promotions.first_order_only boolean not null default false`; `profiles.signup_offer_code text null`; table `promotion_redemptions (id uuid pk, promotion_id uuid → promotions on delete cascade, user_id uuid → profiles on delete cascade, order_id uuid → orders on delete set null, created_at, updated_at, unique (promotion_id, user_id))`; `handle_new_user()` stores `raw_user_meta_data->>'offer_code'` (uppercased, trimmed) into `profiles.signup_offer_code` only when it equals the `code` of an existing `first_order_only` promotion; `prevent_profile_privilege_escalation()` also blocks non-service-role/non-admin changes to `signup_offer_code`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260920120000_scan_offer.sql` with exactly:

```sql
-- Milestone 25: schema for the "scan the sticker, sign up, get 15% off your
-- first order" welcome offer (docs/superpowers/specs/2026-09-20-scan-offer-design.md).
--
-- Schema only. The SCAN15 promotion row is deliberately NOT seeded here: it is
-- created after the app code that understands first_order_only is deployed,
-- because the previously deployed checkout would honour an unrestricted
-- SCAN15 as an ordinary unlimited 15% code.

-- =========================================================================
-- promotions.first_order_only
-- =========================================================================
alter table public.promotions
  add column if not exists first_order_only boolean not null default false;

comment on column public.promotions.first_order_only is
  'When true the promotion is redeemable once per authenticated customer and only while they have no paid, fulfilled or shipped order. Enforced server-side by resolvePromotion (src/lib/promotions).';

-- =========================================================================
-- profiles.signup_offer_code
-- =========================================================================
alter table public.profiles
  add column if not exists signup_offer_code text;

comment on column public.profiles.signup_offer_code is
  'Code of a first_order_only promotion the customer arrived with (?offer= at signup, e.g. from the QR sticker). Written only by handle_new_user(); the welcome offer is auto-applied at checkout from it.';

-- =========================================================================
-- promotion_redemptions: one row per (promotion, customer), written only by
-- the Stripe webhook (service role) after payment is confirmed.
-- =========================================================================
create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (promotion_id, user_id)
);

comment on table public.promotion_redemptions is
  'Records that a customer used a promotion on a paid order. Enforces one use per customer for first_order_only promotions. Service-role writes only (Stripe webhook); customers may read their own rows.';

alter table public.promotion_redemptions enable row level security;

create policy "promotion_redemptions select own"
  on public.promotion_redemptions
  for select
  using (auth.uid() = user_id or public.is_admin());

create index promotion_redemptions_user_id_idx on public.promotion_redemptions(user_id);

-- =========================================================================
-- handle_new_user(): now also captures an offer code from signup metadata
-- =========================================================================
--
-- Identical to the Milestone 9 version (referral capture) plus: the client
-- passes ?offer= as auth.signUp's options.data.offer_code. It is stored on
-- the profile only when it names an existing first_order_only promotion;
-- anything else (unknown, empty, a normal promotion) is a silent no-op, never
-- an error - signup must never fail because of a bad ?offer= value.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral_code text;
  v_referrer_id uuid;
  v_offer_code text;
begin
  v_referral_code := new.raw_user_meta_data->>'referral_code';

  if v_referral_code is not null then
    select id into v_referrer_id
    from public.profiles
    where referral_code = v_referral_code;
  end if;

  select code into v_offer_code
  from public.promotions
  where first_order_only
    and code = upper(btrim(coalesce(new.raw_user_meta_data->>'offer_code', '')));

  if v_referrer_id is not null and v_referrer_id <> new.id then
    insert into public.profiles (id, email, referred_by, signup_offer_code)
    values (new.id, new.email, v_referrer_id, v_offer_code);

    insert into public.referrals (referrer_id, referred_id, status)
    values (v_referrer_id, new.id, 'pending');
  else
    insert into public.profiles (id, email, signup_offer_code)
    values (new.id, new.email, v_offer_code);
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Auto-provisions a profiles row on signup (Milestone 1); captures an optional referral relationship from raw_user_meta_data.referral_code (Milestone 9) and an optional welcome-offer code from raw_user_meta_data.offer_code (Milestone 25). Invalid/missing/self-referencing/unknown codes are a silent no-op, never an error.';

-- =========================================================================
-- prevent_profile_privilege_escalation(): also guard signup_offer_code
-- =========================================================================
-- Same body as the service-role-exemption migration, plus the new column.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role cannot be changed by the account owner';
  end if;

  if new.rewards_points is distinct from old.rewards_points then
    raise exception 'rewards_points cannot be changed by the account owner';
  end if;

  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'stripe_customer_id cannot be changed by the account owner';
  end if;

  if new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code cannot be changed by the account owner';
  end if;

  if new.signup_offer_code is distinct from old.signup_offer_code then
    raise exception 'signup_offer_code cannot be changed by the account owner';
  end if;

  return new;
end;
$$;
```

- [ ] **Step 2: Update `src/types/supabase.ts` (hand edit in the generator's alphabetical format)**

`supabase gen types` needs Docker/the CLI login, which are not available here, so edit the file by hand. Use the Edit tool; each `old_string` below is unique in the file.

(a) `profiles` Row — replace:

```ts
          role: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
```

with:

```ts
          role: string
          signup_offer_code: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
```

(b) `profiles` Insert — replace:

```ts
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
```

with:

```ts
          role?: string
          signup_offer_code?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
```

(c) `profiles` Update — replace:

```ts
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
```

with:

```ts
          role?: string
          signup_offer_code?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
```

(d) `promotions` Row — replace:

```ts
          discount_type: string
          expires_at: string | null
          id: string
```

with:

```ts
          discount_type: string
          expires_at: string | null
          first_order_only: boolean
          id: string
```

(e) `promotions` Insert — replace:

```ts
          discount_type: string
          expires_at?: string | null
          id?: string
```

with:

```ts
          discount_type: string
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
```

(f) `promotions` Update — replace:

```ts
          discount_type?: string
          expires_at?: string | null
          id?: string
```

with:

```ts
          discount_type?: string
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
```

(g) New table, inserted immediately before `promotions` (alphabetical: `promotion_redemptions` sorts before `promotions`) — replace:

```ts
      promotions: {
        Row: {
```

with:

```ts
      promotion_redemptions: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          promotion_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          promotion_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          promotion_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
```

- [ ] **Step 3: Verify**

Grep `src/types/supabase.ts`: `signup_offer_code` appears exactly 6 times (`?:`/non-`?:` across Row/Insert/Update in `profiles` gives 3; plus none elsewhere → expect 3), `first_order_only` exactly 3, `promotion_redemptions:` exactly 1. Run `npm run typecheck` — Expected: PASS. (The migration itself cannot be executed here; it is validated when Ted applies it at Gate A. Re-read it once for SQL syntax.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260920120000_scan_offer.sql src/types/supabase.ts
git commit -m "feat: add scan-offer schema (first_order_only, signup_offer_code, promotion_redemptions)"
```

---

### Task 2: Database foundation tests

**Precondition:** Gate A has passed (migration applied to the shared project).

**Files:**
- Create: `tests/integration/scan-offer-foundations.test.ts`

**Interfaces:**
- Consumes: the Task 1 schema; `createAdminSupabaseClient` (`@/lib/supabase/admin`).

- [ ] **Step 1: Write the tests**

Create `tests/integration/scan-offer-foundations.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const admin = createAdminSupabaseClient();

const createdPromotionIds: string[] = [];
const createdUserIds: string[] = [];

afterEach(async () => {
  for (const id of createdUserIds) {
    await admin.from("referrals").delete().or(`referrer_id.eq.${id},referred_id.eq.${id}`);
    await admin.from("customer_activity").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  createdUserIds.length = 0;

  for (const id of createdPromotionIds) {
    await admin.from("promotions").delete().eq("id", id);
  }
  createdPromotionIds.length = 0;
});

async function seedPromotion(firstOrderOnly: boolean) {
  const { data, error } = await admin
    .from("promotions")
    .insert({
      code: `TESTOFFER${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      discount_type: "percent",
      value: 15,
      first_order_only: firstOrderOnly,
    })
    .select("id, code")
    .single();
  if (error || !data) throw error;
  createdPromotionIds.push(data.id);
  return data;
}

async function createUser(metadata?: Record<string, unknown>) {
  const email = `test-scan-${crypto.randomUUID()}@mailinator.com`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw error;
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signedInClient(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function signupOfferCode(userId: string) {
  const { data } = await admin.from("profiles").select("signup_offer_code").eq("id", userId).single();
  return data!.signup_offer_code;
}

describe("handle_new_user: offer capture", () => {
  it("stores the offer code when it names a first_order_only promotion, case-insensitively", async () => {
    const promotion = await seedPromotion(true);
    const user = await createUser({ offer_code: `  ${promotion.code.toLowerCase()} ` });
    expect(await signupOfferCode(user.id)).toBe(promotion.code);
  });

  it("ignores an offer code that does not exist", async () => {
    const user = await createUser({ offer_code: "NOT-A-REAL-OFFER" });
    expect(await signupOfferCode(user.id)).toBeNull();
  });

  it("ignores an offer code that names a promotion which is not first_order_only", async () => {
    const promotion = await seedPromotion(false);
    const user = await createUser({ offer_code: promotion.code });
    expect(await signupOfferCode(user.id)).toBeNull();
  });

  it("ignores an empty offer code", async () => {
    await seedPromotion(true);
    const user = await createUser({ offer_code: "" });
    expect(await signupOfferCode(user.id)).toBeNull();
  });

  it("still links a referral when an offer code is present too", async () => {
    const promotion = await seedPromotion(true);
    const referrer = await createUser();
    const { data: referrerProfile } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", referrer.id)
      .single();

    const referred = await createUser({
      referral_code: referrerProfile!.referral_code,
      offer_code: promotion.code,
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("referred_by, signup_offer_code")
      .eq("id", referred.id)
      .single();
    expect(profile!.referred_by).toBe(referrer.id);
    expect(profile!.signup_offer_code).toBe(promotion.code);

    const { data: referral } = await admin
      .from("referrals")
      .select("status")
      .eq("referrer_id", referrer.id)
      .eq("referred_id", referred.id)
      .single();
    expect(referral!.status).toBe("pending");
  });
});

describe("profiles.signup_offer_code guard", () => {
  it("does not let a customer change their own signup_offer_code", async () => {
    const promotion = await seedPromotion(true);
    const user = await createUser({ offer_code: promotion.code });
    const client = await signedInClient(user.email, user.password);

    const { error } = await client
      .from("profiles")
      .update({ signup_offer_code: "HACKED" })
      .eq("id", user.id);
    if (error) expect(error.message).toContain("signup_offer_code");

    expect(await signupOfferCode(user.id)).toBe(promotion.code);
  });
});

describe("promotion_redemptions", () => {
  it("allows only one row per (promotion, customer)", async () => {
    const promotion = await seedPromotion(true);
    const user = await createUser();

    const first = await admin
      .from("promotion_redemptions")
      .insert({ promotion_id: promotion.id, user_id: user.id });
    expect(first.error).toBeNull();

    const second = await admin
      .from("promotion_redemptions")
      .insert({ promotion_id: promotion.id, user_id: user.id });
    expect(second.error?.code).toBe("23505");
  });

  it("lets a customer read only their own rows and never write", async () => {
    const promotion = await seedPromotion(true);
    const alice = await createUser();
    const bob = await createUser();
    await admin.from("promotion_redemptions").insert([
      { promotion_id: promotion.id, user_id: alice.id },
      { promotion_id: promotion.id, user_id: bob.id },
    ]);

    const aliceClient = await signedInClient(alice.email, alice.password);
    const { data: visible } = await aliceClient.from("promotion_redemptions").select("user_id");
    expect(visible).toHaveLength(1);
    expect(visible![0].user_id).toBe(alice.id);

    const { error: insertError } = await aliceClient
      .from("promotion_redemptions")
      .insert({ promotion_id: promotion.id, user_id: alice.id });
    expect(insertError).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/integration/scan-offer-foundations.test.ts` — Expected: all 8 tests pass. If any test fails because of the migration (not the test), STOP and report BLOCKED with the failing output — do not edit the migration.

- [ ] **Step 3: Verify the shared DB is left clean**

Confirm with a service-role query in a throwaway `node -e` (do not commit it) that no `promotions` row with a code starting `TESTOFFER` and no auth user with `test-scan-` in the email remains.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/scan-offer-foundations.test.ts
git commit -m "test: cover scan-offer signup trigger, profile guard and redemption table"
```

---

### Task 3: Promotion decision logic (pure, unit-tested)

**Files:**
- Create: `src/lib/promotions/decide-promotion.ts`
- Create: `tests/unit/decide-promotion.test.ts`

**Interfaces:**
- Produces: `PromotionRecord`, `PromotionFacts`, `PromotionDecision`, `INVALID_PROMO_MESSAGE`, `FIRST_ORDER_ONLY_MESSAGE`, `LOGIN_FOR_OFFER_MESSAGE`, `isPromotionUsable(promotion, now)`, `computeDiscountCents(promotion, subtotalCents)`, `describeDiscount(promotion)`, `decidePromotion({ promotion, facts, subtotalCents, now? })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/decide-promotion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  decidePromotion,
  computeDiscountCents,
  describeDiscount,
  isPromotionUsable,
  INVALID_PROMO_MESSAGE,
  FIRST_ORDER_ONLY_MESSAGE,
  LOGIN_FOR_OFFER_MESSAGE,
  type PromotionRecord,
  type PromotionFacts,
} from "@/lib/promotions/decide-promotion";

const NOW = new Date("2026-09-20T12:00:00Z");

function promo(overrides: Partial<PromotionRecord> = {}): PromotionRecord {
  return {
    id: "promo-1",
    code: "SCAN15",
    discount_type: "percent",
    value: 15,
    usage_limit: null,
    used_count: 0,
    expires_at: null,
    first_order_only: false,
    ...overrides,
  };
}

function facts(overrides: Partial<PromotionFacts> = {}): PromotionFacts {
  return { userId: "user-1", hasPriorPaidOrder: false, hasRedeemed: false, ...overrides };
}

describe("computeDiscountCents", () => {
  it("rounds a percent discount of the subtotal", () => {
    expect(computeDiscountCents(promo(), 1500)).toBe(225);
    expect(computeDiscountCents(promo(), 1999)).toBe(300); // 299.85 rounds up
  });

  it("uses a fixed discount as-is, in cents", () => {
    expect(computeDiscountCents(promo({ discount_type: "fixed", value: 300 }), 1500)).toBe(300);
  });

  it("accepts a numeric value that arrives as a string", () => {
    expect(computeDiscountCents(promo({ value: "15" as unknown as number }), 1000)).toBe(150);
  });
});

describe("describeDiscount", () => {
  it("describes percent and fixed discounts for display", () => {
    expect(describeDiscount(promo())).toBe("15% off");
    expect(describeDiscount(promo({ discount_type: "fixed", value: 300 }))).toBe("$3.00 off");
  });
});

describe("isPromotionUsable", () => {
  it("is usable with no limit and no expiry", () => {
    expect(isPromotionUsable(promo(), NOW)).toBe(true);
  });

  it("is not usable once expired", () => {
    expect(isPromotionUsable(promo({ expires_at: "2026-09-20T11:59:59Z" }), NOW)).toBe(false);
    expect(isPromotionUsable(promo({ expires_at: "2026-09-20T12:00:01Z" }), NOW)).toBe(true);
  });

  it("is not usable once the usage limit is reached", () => {
    expect(isPromotionUsable(promo({ usage_limit: 5, used_count: 5 }), NOW)).toBe(false);
    expect(isPromotionUsable(promo({ usage_limit: 5, used_count: 4 }), NOW)).toBe(true);
  });
});

describe("decidePromotion", () => {
  it("rejects a missing promotion", () => {
    expect(decidePromotion({ promotion: null, facts: facts(), subtotalCents: 1500, now: NOW })).toEqual({
      ok: false,
      status: 400,
      message: INVALID_PROMO_MESSAGE,
    });
  });

  it("rejects an expired promotion with the existing invalid-code message", () => {
    const result = decidePromotion({
      promotion: promo({ expires_at: "2026-01-01T00:00:00Z" }),
      facts: facts(),
      subtotalCents: 1500,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, status: 400, message: INVALID_PROMO_MESSAGE });
  });

  it("applies an ordinary promotion for a guest and ignores the first-order facts", () => {
    const result = decidePromotion({
      promotion: promo(),
      facts: facts({ userId: null, hasPriorPaidOrder: true, hasRedeemed: true }),
      subtotalCents: 1500,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, promotionId: "promo-1", discountCents: 225, description: "15% off" });
  });

  it("applies a first-order-only promotion to an eligible customer", () => {
    const result = decidePromotion({
      promotion: promo({ first_order_only: true }),
      facts: facts(),
      subtotalCents: 1500,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, promotionId: "promo-1", discountCents: 225, description: "15% off" });
  });

  it("asks a guest to log in or sign up for a first-order-only promotion", () => {
    const result = decidePromotion({
      promotion: promo({ first_order_only: true }),
      facts: facts({ userId: null }),
      subtotalCents: 1500,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, status: 400, message: LOGIN_FOR_OFFER_MESSAGE });
  });

  it("refuses a first-order-only promotion after a paid order", () => {
    const result = decidePromotion({
      promotion: promo({ first_order_only: true }),
      facts: facts({ hasPriorPaidOrder: true }),
      subtotalCents: 1500,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, status: 400, message: FIRST_ORDER_ONLY_MESSAGE });
  });

  it("refuses a first-order-only promotion the customer already redeemed", () => {
    const result = decidePromotion({
      promotion: promo({ first_order_only: true }),
      facts: facts({ hasRedeemed: true }),
      subtotalCents: 1500,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, status: 400, message: FIRST_ORDER_ONLY_MESSAGE });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/decide-promotion.test.ts` — Expected: FAIL (module `@/lib/promotions/decide-promotion` not found).

- [ ] **Step 3: Implement**

Create `src/lib/promotions/decide-promotion.ts`:

```ts
export interface PromotionRecord {
  id: string;
  code: string;
  discount_type: string;
  value: number;
  usage_limit: number | null;
  used_count: number;
  expires_at: string | null;
  first_order_only: boolean;
}

export interface PromotionFacts {
  userId: string | null;
  hasPriorPaidOrder: boolean;
  hasRedeemed: boolean;
}

export type PromotionDecision =
  | { ok: true; promotionId: string; discountCents: number; description: string }
  | { ok: false; status: 400; message: string };

export const INVALID_PROMO_MESSAGE = "That promo code isn't valid";
export const FIRST_ORDER_ONLY_MESSAGE = "That offer is for your first order only";
export const LOGIN_FOR_OFFER_MESSAGE = "Log in or sign up to use this offer";

export function isPromotionUsable(promotion: PromotionRecord, now: Date): boolean {
  return (
    (promotion.usage_limit === null || promotion.used_count < promotion.usage_limit) &&
    (promotion.expires_at === null || new Date(promotion.expires_at) > now)
  );
}

export function computeDiscountCents(promotion: PromotionRecord, subtotalCents: number): number {
  return promotion.discount_type === "percent"
    ? Math.round((subtotalCents * Number(promotion.value)) / 100)
    : Math.round(Number(promotion.value));
}

export function describeDiscount(promotion: PromotionRecord): string {
  return promotion.discount_type === "percent"
    ? `${Number(promotion.value)}% off`
    : `$${(Number(promotion.value) / 100).toFixed(2)} off`;
}

export function decidePromotion(input: {
  promotion: PromotionRecord | null;
  facts: PromotionFacts;
  subtotalCents: number;
  now?: Date;
}): PromotionDecision {
  const { promotion, facts, subtotalCents } = input;

  if (!promotion || !isPromotionUsable(promotion, input.now ?? new Date())) {
    return { ok: false, status: 400, message: INVALID_PROMO_MESSAGE };
  }

  if (promotion.first_order_only) {
    if (!facts.userId) {
      return { ok: false, status: 400, message: LOGIN_FOR_OFFER_MESSAGE };
    }
    if (facts.hasPriorPaidOrder || facts.hasRedeemed) {
      return { ok: false, status: 400, message: FIRST_ORDER_ONLY_MESSAGE };
    }
  }

  return {
    ok: true,
    promotionId: promotion.id,
    discountCents: computeDiscountCents(promotion, subtotalCents),
    description: describeDiscount(promotion),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/decide-promotion.test.ts` — Expected: all tests PASS, pristine output. Run `npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/promotions/decide-promotion.ts tests/unit/decide-promotion.test.ts
git commit -m "feat: add pure promotion decision logic with first-order rules"
```

---

### Task 4: `resolvePromotion` and the two checkout routes

**Files:**
- Create: `src/lib/promotions/resolve-promotion.ts`
- Create: `src/lib/promotions/scan-offer.ts`
- Modify: `src/app/api/checkout/session/route.ts`
- Modify: `src/app/api/checkout/payment-intent/route.ts`
- Modify (tests): `tests/integration/checkout-session-route.test.ts`, `tests/integration/checkout-payment-intent-route.test.ts`

**Interfaces:**
- Consumes: Task 3's `decidePromotion` and types; the Task 1 schema (Gate A applied).
- Produces: `resolvePromotion(admin, { userId, promoCode?, subtotalCents }) → ResolvedPromotion`, where `ResolvedPromotion = { ok: true; promotionId: string | null; discountCents: number; description: string | null } | { ok: false; status: 400; message: string }`; `promotionId === null` means "no discount, no error". `SCAN_OFFER_CODE = "SCAN15"` (used by the `/scan` page).

- [ ] **Step 1: Extend `seedPromotion` in `checkout-session-route.test.ts`**

Replace:

```ts
    usedCount: number;
    expiresAt: string | null;
  }> = {}
```

with:

```ts
    usedCount: number;
    expiresAt: string | null;
    firstOrderOnly: boolean;
  }> = {}
```

Replace:

```ts
      expires_at: overrides.expiresAt ?? null,
    })
```

with:

```ts
      expires_at: overrides.expiresAt ?? null,
      first_order_only: overrides.firstOrderOnly ?? false,
    })
```

In the file's `afterEach`, immediately before the final `await admin.from("profiles").update({ rewards_points: rewardsBalanceBeforeAll }).eq("id", userId);` line, add:

```ts
  await admin.from("promotion_redemptions").delete().eq("user_id", userId);
  await admin.from("orders").delete().eq("user_id", userId).eq("total_amount_cents", 777);
  await admin.from("profiles").update({ signup_offer_code: null }).eq("id", userId);
```

- [ ] **Step 2: Write the failing integration tests**

Append this block at the very end of `tests/integration/checkout-session-route.test.ts` (Read the last lines first; add a blank line, then the block after the file's final closing `});`):

```ts
describe("POST /api/checkout/session: first-order welcome offer", () => {
  async function addBoxToAuthenticatedCart() {
    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(response.ok).toBe(true);
    createdCartIds.push(await cartIdForAuthenticatedUser());
  }

  async function seedPaidOrderForUser() {
    const { error } = await admin
      .from("orders")
      .insert({ user_id: userId, status: "paid", total_amount_cents: 777 });
    if (error) throw error;
  }

  async function startSession(body: Record<string, unknown>, opts: { token?: string; cookie?: string } = {}) {
    const response = await postCheckoutSession(checkoutSessionRequest(body, opts));
    const json = await response.json();
    return { response, json };
  }

  it("auto-applies the offer for a customer who signed up through the scan and has no paid order", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    await admin.from("profiles").update({ signup_offer_code: promotion.code }).eq("id", userId);
    await addBoxToAuthenticatedCart();

    const { response, json } = await startSession({}, { token: userToken });
    expect(response.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(json.data.id);
    expect(session.amount_total).toBe(1500 - 225);
    expect(session.metadata?.promotion_id).toBe(promotion.id);
  });

  it("charges full price, without an error, when the customer has no signup offer", async () => {
    await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    await addBoxToAuthenticatedCart();

    const { response, json } = await startSession({}, { token: userToken });
    expect(response.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(json.data.id);
    expect(session.amount_total).toBe(1500);
    expect(session.metadata?.promotion_id).toBeUndefined();
  });

  it("does not auto-apply once the customer has a paid order", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    await admin.from("profiles").update({ signup_offer_code: promotion.code }).eq("id", userId);
    await seedPaidOrderForUser();
    await addBoxToAuthenticatedCart();

    const { response, json } = await startSession({}, { token: userToken });
    expect(response.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(json.data.id);
    expect(session.amount_total).toBe(1500);
    expect(session.metadata?.promotion_id).toBeUndefined();
  });

  it("does not auto-apply once the customer has already redeemed it", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    await admin.from("profiles").update({ signup_offer_code: promotion.code }).eq("id", userId);
    await admin.from("promotion_redemptions").insert({ promotion_id: promotion.id, user_id: userId });
    await addBoxToAuthenticatedCart();

    const { response, json } = await startSession({}, { token: userToken });
    expect(response.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(json.data.id);
    expect(session.amount_total).toBe(1500);
  });

  it("applies a typed first-order-only code for an eligible customer", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    await addBoxToAuthenticatedCart();

    const { response, json } = await startSession({ promoCode: promotion.code }, { token: userToken });
    expect(response.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(json.data.id);
    expect(session.amount_total).toBe(1500 - 225);
  });

  it("refuses a typed first-order-only code after a paid order, with a specific message", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    await seedPaidOrderForUser();
    await addBoxToAuthenticatedCart();

    const { response, json } = await startSession({ promoCode: promotion.code }, { token: userToken });
    expect(response.status).toBe(400);
    expect(json.error.message).toBe("That offer is for your first order only");
  });

  it("refuses a typed first-order-only code from a guest", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const { response, json } = await startSession(
      { guestEmail: "guest-offer@example.com", promoCode: promotion.code },
      { cookie: cookieValue }
    );
    expect(response.status).toBe(400);
    expect(json.error.message).toBe("Log in or sign up to use this offer");
  });

  it("lets a typed ordinary code win over the auto-applied welcome offer", async () => {
    const offer = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    const fixed = await seedPromotion({ discountType: "fixed", value: 300 });
    await admin.from("profiles").update({ signup_offer_code: offer.code }).eq("id", userId);
    await addBoxToAuthenticatedCart();

    const { response, json } = await startSession({ promoCode: fixed.code }, { token: userToken });
    expect(response.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(json.data.id);
    expect(session.amount_total).toBe(1500 - 300);
    expect(session.metadata?.promotion_id).toBe(fixed.id);
  });
});
```

- [ ] **Step 3: Run to verify the new tests fail**

Run: `npx vitest run tests/integration/checkout-session-route.test.ts` — Expected: the 8 new tests marked failing where behaviour is missing (auto-apply, first-order refusals, guest refusal), all pre-existing tests still passing. Record the failing names in the report (RED evidence).

- [ ] **Step 4: Implement `scan-offer.ts` and `resolve-promotion.ts`**

Create `src/lib/promotions/scan-offer.ts`:

```ts
export const SCAN_OFFER_CODE = "SCAN15";
```

Create `src/lib/promotions/resolve-promotion.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  decidePromotion,
  type PromotionFacts,
  type PromotionRecord,
} from "@/lib/promotions/decide-promotion";

type AdminClient = SupabaseClient<Database>;

const PROMOTION_COLUMNS =
  "id, code, discount_type, value, usage_limit, used_count, expires_at, first_order_only";
const PAID_ORDER_STATUSES = ["paid", "fulfilled", "shipped"];

export type ResolvedPromotion =
  | { ok: true; promotionId: string | null; discountCents: number; description: string | null }
  | { ok: false; status: 400; message: string };

const NO_PROMOTION: ResolvedPromotion = {
  ok: true,
  promotionId: null,
  discountCents: 0,
  description: null,
};

async function findPromotion(admin: AdminClient, code: string): Promise<PromotionRecord | null> {
  const { data } = await admin
    .from("promotions")
    .select(PROMOTION_COLUMNS)
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data;
}

async function loadFacts(
  admin: AdminClient,
  promotion: PromotionRecord,
  userId: string | null
): Promise<PromotionFacts> {
  if (!userId || !promotion.first_order_only) {
    return { userId, hasPriorPaidOrder: false, hasRedeemed: false };
  }

  const [orders, redemption] = await Promise.all([
    admin
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", PAID_ORDER_STATUSES)
      .is("deleted_at", null)
      .limit(1),
    admin
      .from("promotion_redemptions")
      .select("id")
      .eq("promotion_id", promotion.id)
      .eq("user_id", userId)
      .limit(1),
  ]);

  return {
    userId,
    hasPriorPaidOrder: (orders.data ?? []).length > 0,
    hasRedeemed: (redemption.data ?? []).length > 0,
  };
}

export async function resolvePromotion(
  admin: AdminClient,
  input: { userId: string | null; promoCode?: string; subtotalCents: number }
): Promise<ResolvedPromotion> {
  const typedCode = input.promoCode?.trim();

  if (typedCode) {
    const promotion = await findPromotion(admin, typedCode);
    const facts = promotion
      ? await loadFacts(admin, promotion, input.userId)
      : { userId: input.userId, hasPriorPaidOrder: false, hasRedeemed: false };
    return decidePromotion({ promotion, facts, subtotalCents: input.subtotalCents });
  }

  if (!input.userId) return NO_PROMOTION;

  const { data: profile } = await admin
    .from("profiles")
    .select("signup_offer_code")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.signup_offer_code) return NO_PROMOTION;

  const promotion = await findPromotion(admin, profile.signup_offer_code);
  if (!promotion) return NO_PROMOTION;

  const facts = await loadFacts(admin, promotion, input.userId);
  const decision = decidePromotion({ promotion, facts, subtotalCents: input.subtotalCents });
  return decision.ok ? decision : NO_PROMOTION;
}
```

- [ ] **Step 5: Wire `/api/checkout/session`**

In `src/app/api/checkout/session/route.ts` replace:

```ts
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";
```

with:

```ts
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";
import { resolvePromotion } from "@/lib/promotions/resolve-promotion";
```

Replace this whole block:

```ts
  let promotionId: string | null = null;
  let promoDiscountCents = 0;
  if (parsed.data.promoCode) {
    const { data: promotion } = await admin
      .from("promotions")
      .select("id, discount_type, value, usage_limit, used_count, expires_at")
      .eq("code", parsed.data.promoCode.toUpperCase())
      .maybeSingle();

    const isUsable =
      promotion &&
      (promotion.usage_limit === null || promotion.used_count < promotion.usage_limit) &&
      (promotion.expires_at === null || new Date(promotion.expires_at) > new Date());

    if (!isUsable) {
      return NextResponse.json({ data: null, error: { message: "That promo code isn't valid" } }, { status: 400 });
    }

    promotionId = promotion.id;
    promoDiscountCents =
      promotion.discount_type === "percent"
        ? Math.round((cart.total.subtotalCents * Number(promotion.value)) / 100)
        : Math.round(Number(promotion.value));
  }
```

with:

```ts
  const promotion = await resolvePromotion(admin, {
    userId: cartResult.userId ?? null,
    promoCode: parsed.data.promoCode,
    subtotalCents: cart.total.subtotalCents,
  });
  if (!promotion.ok) {
    return NextResponse.json({ data: null, error: { message: promotion.message } }, { status: promotion.status });
  }
  const promotionId = promotion.promotionId;
  const promoDiscountCents = promotion.discountCents;
```

- [ ] **Step 6: Wire `/api/checkout/payment-intent`**

In `src/app/api/checkout/payment-intent/route.ts` replace:

```ts
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";
```

with:

```ts
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";
import { resolvePromotion } from "@/lib/promotions/resolve-promotion";
```

Replace this whole block (note `applies_to_shipping` is selected but never used today — dropping it changes no behaviour):

```ts
  let promotionId: string | null = null;
  let promoDiscountCents = 0;
  if (parsed.data.promoCode) {
    const { data: promotion } = await admin
      .from("promotions")
      .select("id, discount_type, value, usage_limit, used_count, expires_at, applies_to_shipping")
      .eq("code", parsed.data.promoCode.toUpperCase())
      .maybeSingle();

    const isUsable =
      promotion &&
      (promotion.usage_limit === null || promotion.used_count < promotion.usage_limit) &&
      (promotion.expires_at === null || new Date(promotion.expires_at) > new Date());

    if (!isUsable) {
      return NextResponse.json({ data: null, error: { message: "That promo code isn't valid" } }, { status: 400 });
    }

    promotionId = promotion.id;
    promoDiscountCents =
      promotion.discount_type === "percent"
        ? Math.round((cart.total.subtotalCents * Number(promotion.value)) / 100)
        : Math.round(Number(promotion.value));
  }
```

with:

```ts
  const promotion = await resolvePromotion(admin, {
    userId: cartResult.userId ?? null,
    promoCode: parsed.data.promoCode,
    subtotalCents: cart.total.subtotalCents,
  });
  if (!promotion.ok) {
    return NextResponse.json({ data: null, error: { message: promotion.message } }, { status: promotion.status });
  }
  const promotionId = promotion.promotionId;
  const promoDiscountCents = promotion.discountCents;
```

- [ ] **Step 7: Add one auto-apply test to the payment-intent route test**

Read `tests/integration/checkout-payment-intent-route.test.ts` and its existing promo test. Following that file's own fixtures and helper names, extend its `seedPromotion` with a `firstOrderOnly` override exactly as in Step 1 (insert `first_order_only: overrides.firstOrderOnly ?? false`), add cleanup of `promotion_redemptions`/`signup_offer_code` for its authenticated user in its `afterEach`, and append ONE test: an authenticated customer with `profiles.signup_offer_code` set to a `firstOrderOnly` percent-15 promotion and no paid order gets `paymentIntent.amount` reduced by `round(subtotal × 15 / 100)` and `metadata.promotion_id` equal to the promotion id. Base its cart/shipping-address setup on the file's existing authenticated promo test.

- [ ] **Step 8: Run**

Run each in the foreground and wait:
`npx vitest run tests/integration/checkout-session-route.test.ts` — Expected: all pass (existing + 8 new).
`npx vitest run tests/integration/checkout-payment-intent-route.test.ts` — Expected: all pass (existing + 1 new).
`npm run typecheck` — Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/promotions/resolve-promotion.ts src/lib/promotions/scan-offer.ts src/app/api/checkout/session/route.ts src/app/api/checkout/payment-intent/route.ts tests/integration/checkout-session-route.test.ts tests/integration/checkout-payment-intent-route.test.ts
git commit -m "feat: resolve promotions in one place with first-order rules and welcome-offer auto-apply"
```

---

### Task 5: Record redemptions in the Stripe webhook

**Files:**
- Create: `src/lib/promotions/record-redemption.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Modify (tests): `tests/integration/checkout-webhook-route.test.ts`

**Interfaces:**
- Consumes: `promotion_redemptions` (Task 1).
- Produces: `recordPromotionRedemption(admin, { promotionId, userId, orderId }): Promise<void>` — upserts `(promotion_id, user_id, order_id)` ignoring duplicates; no-op for guests (`userId` null); logs and never throws.

- [ ] **Step 1: Extend the webhook test helpers**

In `tests/integration/checkout-webhook-route.test.ts` replace:

```ts
  overrides: Partial<{ discountType: "percent" | "fixed"; value: number; usageLimit: number | null }> = {}
```

with:

```ts
  overrides: Partial<{
    discountType: "percent" | "fixed";
    value: number;
    usageLimit: number | null;
    firstOrderOnly: boolean;
  }> = {}
```

Replace:

```ts
      usage_limit: overrides.usageLimit ?? null,
    })
```

with:

```ts
      usage_limit: overrides.usageLimit ?? null,
      first_order_only: overrides.firstOrderOnly ?? false,
    })
```

- [ ] **Step 2: Write the failing test**

Directly after the existing test `increments the promotion's used_count exactly once, not again on redelivery` (it ends with `}, 20000);`), add:

```ts
  it("records one promotion redemption for a first-order offer, not again on redelivery, and blocks a second use", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
    const customer = await createUser("offer-redeemer");

    const cartResponse = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: customer.token })
    );
    expect(cartResponse.ok).toBe(true);
    const { data: cart } = await admin
      .from("carts")
      .select("id")
      .eq("user_id", customer.id)
      .eq("status", "active")
      .single();
    createdCartIds.push(cart!.id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ promoCode: promotion.code }, { token: customer.token })
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };
    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);

    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: redemptions } = await admin
      .from("promotion_redemptions")
      .select("order_id")
      .eq("promotion_id", promotion.id)
      .eq("user_id", customer.id);
    expect(redemptions).toHaveLength(1);
    expect(redemptions![0].order_id).toBe(order!.id);

    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);
    const { data: afterRedelivery } = await admin
      .from("promotion_redemptions")
      .select("id")
      .eq("promotion_id", promotion.id)
      .eq("user_id", customer.id);
    expect(afterRedelivery).toHaveLength(1);

    const cartAgain = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: customer.token })
    );
    expect(cartAgain.ok).toBe(true);
    const { data: cart2 } = await admin
      .from("carts")
      .select("id")
      .eq("user_id", customer.id)
      .eq("status", "active")
      .single();
    createdCartIds.push(cart2!.id);

    const secondCheckout = await postCheckoutSession(
      checkoutSessionRequest({ promoCode: promotion.code }, { token: customer.token })
    );
    expect(secondCheckout.status).toBe(400);
    expect((await secondCheckout.json()).error.message).toBe("That offer is for your first order only");
  }, 40000);
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/integration/checkout-webhook-route.test.ts -t "records one promotion redemption"` — Expected: FAIL (no redemption row is written yet).

- [ ] **Step 4: Implement**

Create `src/lib/promotions/record-redemption.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function recordPromotionRedemption(
  admin: SupabaseClient<Database>,
  input: { promotionId: string; userId: string | null; orderId: string }
): Promise<void> {
  if (!input.userId) return;

  const { error } = await admin
    .from("promotion_redemptions")
    .upsert(
      { promotion_id: input.promotionId, user_id: input.userId, order_id: input.orderId },
      { onConflict: "promotion_id,user_id", ignoreDuplicates: true }
    );

  if (error) {
    console.error(
      `Promotion ${input.promotionId} redemption could not be recorded for order ${input.orderId}:`,
      error
    );
  }
}
```

In `src/app/api/webhooks/stripe/route.ts`, add the import next to the file's other `@/lib/...` imports (Read the top of the file and place it with them):

```ts
import { recordPromotionRedemption } from "@/lib/promotions/record-redemption";
```

Replace (Checkout Session handler):

```ts
  const promotionId = session.metadata?.promotion_id ?? null;
  if (promotionId) {
    const { data: incremented, error: promoError } = await admin.rpc("increment_promotion_used_count", {
      p_promotion_id: promotionId,
    });
    if (promoError || incremented === false) {
      console.error(`Promotion ${promotionId} usage could not be recorded for order ${order.id} (paid=true):`, promoError);
    }
  }
```

with:

```ts
  const promotionId = session.metadata?.promotion_id ?? null;
  if (promotionId) {
    const { data: incremented, error: promoError } = await admin.rpc("increment_promotion_used_count", {
      p_promotion_id: promotionId,
    });
    if (promoError || incremented === false) {
      console.error(`Promotion ${promotionId} usage could not be recorded for order ${order.id} (paid=true):`, promoError);
    }
    await recordPromotionRedemption(admin, { promotionId, userId: userId ?? null, orderId: order.id });
  }
```

Replace (Payment Intent handler):

```ts
  const promotionId = paymentIntent.metadata?.promotion_id ?? null;
  if (promotionId) {
    const { data: incremented, error: promoError } = await admin.rpc("increment_promotion_used_count", {
      p_promotion_id: promotionId,
    });
    if (promoError || incremented === false) {
      console.error(`Promotion ${promotionId} usage could not be recorded for order ${order.id} (paid=true):`, promoError);
    }
  }
```

with:

```ts
  const promotionId = paymentIntent.metadata?.promotion_id ?? null;
  if (promotionId) {
    const { data: incremented, error: promoError } = await admin.rpc("increment_promotion_used_count", {
      p_promotion_id: promotionId,
    });
    if (promoError || incremented === false) {
      console.error(`Promotion ${promotionId} usage could not be recorded for order ${order.id} (paid=true):`, promoError);
    }
    await recordPromotionRedemption(admin, { promotionId, userId: userId ?? null, orderId: order.id });
  }
```

(If `typecheck` shows `userId` is not in scope or has a different type in either handler, use the local variable that the surrounding `if (userId) { … credit_rewards_points … }` block uses; do not invent a new source for the customer id.)

- [ ] **Step 5: Run**

`npx vitest run tests/integration/checkout-webhook-route.test.ts` — Expected: all pass (existing + 1 new). `npx vitest run tests/integration/payment-intent-webhook.test.ts` — Expected: all pass. `npm run typecheck` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/promotions/record-redemption.ts src/app/api/webhooks/stripe/route.ts tests/integration/checkout-webhook-route.test.ts
git commit -m "feat: record promotion redemptions after payment is confirmed"
```

---

### Task 6: Signup plumbing (`offerCode` → `offer_code`)

**Files:**
- Modify: `src/lib/validations/auth.ts`
- Modify: `src/app/api/auth/signup/route.ts`
- Modify: `src/app/(auth)/signup/page.tsx`
- Modify (tests): `tests/unit/validations-auth.test.ts`, `tests/integration/auth-signup-route.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `signupSchema` accepts optional `offerCode`; `/api/auth/signup` forwards it as `options.data.offer_code` (merged with `referral_code`); the web signup page forwards `?offer=` the same way.

- [ ] **Step 1: Write the failing tests**

Read `tests/unit/validations-auth.test.ts` and add to its signup `describe`:

```ts
  it("accepts an optional offerCode and trims it", () => {
    const parsed = signupSchema.parse({ email: "a@b.com", password: "password123", offerCode: "  SCAN15 " });
    expect(parsed.offerCode).toBe("SCAN15");
  });

  it("rejects an empty offerCode", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "password123", offerCode: "" });
    expect(result.success).toBe(false);
  });
```

In `tests/integration/auth-signup-route.test.ts`, inside `describe("POST /api/auth/signup", ...)` add:

```ts
  it("forwards an offerCode as offer_code metadata, merged with a referral code", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: "fake-user-id-456" } }, error: null });

    const { POST } = await import("@/app/api/auth/signup/route");

    const request = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "a@b.com",
        password: "password123",
        referralCode: "abc123",
        offerCode: "SCAN15",
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "password123",
      options: { data: { referral_code: "abc123", offer_code: "SCAN15" } },
    });
  });

  it("forwards only offer_code when there is no referral code", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: "fake-user-id-789" } }, error: null });

    const { POST } = await import("@/app/api/auth/signup/route");

    const request = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "password123", offerCode: "SCAN15" }),
    });
    await POST(request);

    expect(mockSignUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "password123",
      options: { data: { offer_code: "SCAN15" } },
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

`npx vitest run tests/unit/validations-auth.test.ts tests/integration/auth-signup-route.test.ts` — Expected: the 4 new tests FAIL; existing tests pass.

- [ ] **Step 3: Implement**

In `src/lib/validations/auth.ts` replace:

```ts
  referralCode: z.string().trim().min(1).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;
```

with:

```ts
  referralCode: z.string().trim().min(1).optional(),
  // Milestone 25: forwarded the same way as referralCode; the
  // handle_new_user() trigger only keeps it if it names a first_order_only
  // promotion, so an unknown value is a silent no-op, never a 400 here.
  offerCode: z.string().trim().min(1).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;
```

In `src/app/api/auth/signup/route.ts` replace:

```ts
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(parsed.data.referralCode
      ? { options: { data: { referral_code: parsed.data.referralCode } } }
      : {}),
  });
```

with:

```ts
  const signUpMetadata: Record<string, string> = {};
  if (parsed.data.referralCode) signUpMetadata.referral_code = parsed.data.referralCode;
  if (parsed.data.offerCode) signUpMetadata.offer_code = parsed.data.offerCode;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(Object.keys(signUpMetadata).length > 0 ? { options: { data: signUpMetadata } } : {}),
  });
```

In `src/app/(auth)/signup/page.tsx` replace:

```ts
  const referralCode = searchParams.get("ref");
```

with:

```ts
  const referralCode = searchParams.get("ref");
  const offerCode = searchParams.get("offer");
```

and replace:

```ts
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      ...(referralCode ? { options: { data: { referral_code: referralCode } } } : {}),
    });
```

with:

```ts
    const signUpMetadata: Record<string, string> = {};
    if (referralCode) signUpMetadata.referral_code = referralCode;
    if (offerCode) signUpMetadata.offer_code = offerCode;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      ...(Object.keys(signUpMetadata).length > 0 ? { options: { data: signUpMetadata } } : {}),
    });
```

- [ ] **Step 4: Run**

`npx vitest run tests/unit/validations-auth.test.ts tests/integration/auth-signup-route.test.ts` — Expected: all PASS. `npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/auth.ts src/app/api/auth/signup/route.ts "src/app/(auth)/signup/page.tsx" tests/unit/validations-auth.test.ts tests/integration/auth-signup-route.test.ts
git commit -m "feat: carry a welcome-offer code through signup"
```

---

### Task 7: The `/scan` landing page

**Files:**
- Create: `src/app/(marketing)/scan/page.tsx`
- Create: `tests/e2e/scan-offer.spec.ts`

**Interfaces:**
- Consumes: `SCAN_OFFER_CODE` (Task 4).

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/scan-offer.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("the scan page explains the offer and sends new customers to signup with the offer code", async ({ page }) => {
  await page.goto("/scan", { timeout: 60000 });

  await expect(page.getByRole("heading", { level: 1, name: "15% off your first order" })).toBeVisible();

  const cta = page.getByRole("link", { name: "Create my account" });
  await expect(cta).toHaveAttribute("href", "/signup?offer=SCAN15");

  await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(page.getByText(/one use per customer/i)).toBeVisible();

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("the create-account button lands on the signup form", async ({ page }) => {
  await page.goto("/scan", { timeout: 60000 });
  await page.getByRole("link", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/signup\?offer=SCAN15/);
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails**

`npx playwright test tests/e2e/scan-offer.spec.ts` — Expected: FAIL (404 on `/scan`). (First run starts `npm run dev`; allow several minutes.)

- [ ] **Step 3: Implement the page**

Create `src/app/(marketing)/scan/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SCAN_OFFER_CODE } from "@/lib/promotions/scan-offer";

export const metadata: Metadata = {
  title: "15% off your first order | The Sweet Shop",
  description: "Create an account and get 15% off your first order at The Sweet Shop.",
  robots: { index: false, follow: false },
};

const STEPS = [
  "Create your free account.",
  "Confirm your email, then log in.",
  "Shop — your 15% comes off at checkout automatically.",
];

export default function ScanOfferPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Welcome</p>
      <h1 className="mt-2 text-4xl font-bold">15% off your first order</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Thanks for scanning! Sign up and your discount is applied for you — there&apos;s no code to type.
      </p>

      <ol className="mx-auto mt-8 max-w-sm space-y-3 text-left">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <Link
        href={`/signup?offer=${SCAN_OFFER_CODE}`}
        className="mt-10 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
      >
        Create my account
      </Link>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        New accounts only, on your first order · one use per customer.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run**

`npx playwright test tests/e2e/scan-offer.spec.ts` — Expected: 2 passed. `npm run typecheck` and `npm run lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/scan/page.tsx" tests/e2e/scan-offer.spec.ts
git commit -m "feat: add the /scan landing page for the sticker offer"
```

---

### Task 8: Cart page shows the welcome offer

**Files:**
- Modify: `src/app/(shop)/shop/cart/page.tsx`
- Modify (tests): `tests/e2e/scan-offer.spec.ts`

**Interfaces:**
- Consumes: `resolvePromotion` (Task 4).

- [ ] **Step 1: Write the failing e2e tests**

Append to `tests/e2e/scan-offer.spec.ts`. First add these imports at the top of the file (below the existing `@playwright/test` import):

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
```

Then append:

```ts
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function loginViaUi(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account/);
}

async function addMunchieBox(page: import("@playwright/test").Page) {
  await page.goto("/shop/box/munchie-box");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });
}

test.describe("welcome offer in the cart", () => {
  const cleanup: Array<() => Promise<unknown>> = [];

  test.afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  async function seedOfferPromotion() {
    const { data, error } = await admin
      .from("promotions")
      .insert({
        code: `E2EOFFER${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        discount_type: "percent",
        value: 15,
        first_order_only: true,
      })
      .select("id, code")
      .single();
    if (error || !data) throw error;
    cleanup.push(async () => admin.from("promotions").delete().eq("id", data.id));
    return data;
  }

  async function createCustomer(metadata?: Record<string, unknown>) {
    const email = `test-e2e-scan-${crypto.randomUUID()}@mailinator.com`;
    const password = "password123";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw error;
    cleanup.push(async () => admin.auth.admin.deleteUser(data.user!.id));
    return { id: data.user.id, email, password };
  }

  test("shows the discount and the reduced total for a customer who signed up through the scan", async ({ page }) => {
    test.setTimeout(120_000);
    const promotion = await seedOfferPromotion();
    const customer = await createCustomer({ offer_code: promotion.code });

    await loginViaUi(page, customer.email, customer.password);
    await addMunchieBox(page);
    await page.goto("/shop/cart", { timeout: 60000 });

    const offerLine = page.getByTestId("cart-welcome-offer");
    await expect(offerLine).toBeVisible();
    await expect(offerLine).toContainText("15% off");
    await expect(offerLine).toContainText("−$2.25");
  });

  test("shows no offer line for a customer without the signup offer", async ({ page }) => {
    test.setTimeout(120_000);
    await seedOfferPromotion();
    const customer = await createCustomer();

    await loginViaUi(page, customer.email, customer.password);
    await addMunchieBox(page);
    await page.goto("/shop/cart", { timeout: 60000 });

    await expect(page.getByTestId("cart-subtotal")).toBeVisible();
    await expect(page.getByTestId("cart-welcome-offer")).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run to verify the first test fails**

`npx playwright test tests/e2e/scan-offer.spec.ts -g "welcome offer in the cart"` — Expected: the first test FAILS (no `cart-welcome-offer` element); the second passes.

- [ ] **Step 3: Implement**

In `src/app/(shop)/shop/cart/page.tsx` replace:

```tsx
import { formatPriceCents } from "@/lib/utils";
```

with:

```tsx
import { formatPriceCents } from "@/lib/utils";
import { resolvePromotion } from "@/lib/promotions/resolve-promotion";
```

Replace:

```tsx
  const total = contents!.total;
  const remainingForFreeShipping = FREE_SHIPPING_THRESHOLD_CENTS - total.subtotalCents;
```

with:

```tsx
  const total = contents!.total;
  const remainingForFreeShipping = FREE_SHIPPING_THRESHOLD_CENTS - total.subtotalCents;

  let welcomeOffer: { discountCents: number; description: string } | null = null;
  if (user) {
    const resolved = await resolvePromotion(admin, {
      userId: user.id,
      subtotalCents: total.subtotalCents,
    });
    if (resolved.ok && resolved.promotionId) {
      welcomeOffer = {
        discountCents: Math.min(resolved.discountCents, total.totalCents),
        description: resolved.description ?? "",
      };
    }
  }
```

Replace:

```tsx
        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total</span>
          <span data-testid="cart-total">{formatPriceCents(total.totalCents)}</span>
        </div>
```

with:

```tsx
        {welcomeOffer && (
          <div className="flex justify-between text-sm text-primary" data-testid="cart-welcome-offer">
            <span>Welcome offer ({welcomeOffer.description})</span>
            <span>−{formatPriceCents(welcomeOffer.discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total</span>
          <span data-testid="cart-total">
            {formatPriceCents(total.totalCents - (welcomeOffer?.discountCents ?? 0))}
          </span>
        </div>
```

- [ ] **Step 4: Run**

`npx playwright test tests/e2e/scan-offer.spec.ts tests/e2e/cart.spec.ts` — Expected: all pass (the existing cart tests cover users without an offer). `npm run typecheck` and `npm run lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(shop)/shop/cart/page.tsx" tests/e2e/scan-offer.spec.ts
git commit -m "feat: show the welcome offer and reduced total in the cart"
```

---

### Task 9: Sticker label generator and artwork

**Files:**
- Create: `scripts/generate-scan-label.mjs`
- Create: `design/scan-label/icon.png` (copied)
- Create (generated, committed): `design/scan-label/scan-label.svg`, `scan-label.png`, `scan-label.pdf`, `scan-label-sheet.pdf`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `npm run label:scan [-- --url <url>]` — default URL `https://www.sweetshopcentral.com/scan`; writes the four files above; exits non-zero unless the generated PNG decodes back to exactly the URL.

- [ ] **Step 1: Dependencies, icon, script entry**

Run `npm install --save-dev qrcode jsqr pngjs`. Create the directory `design/scan-label/` and copy the cupcake icon (a 512×512 PNG) to `design/scan-label/icon.png` from `C:\Users\sbutl\AppData\Local\Temp\claude\C--Users-sbutl\31e9d419-dd57-4f55-b259-0bec9be141b3\scratchpad\qr\icon.png`. In `package.json` `scripts`, add `"label:scan": "node scripts/generate-scan-label.mjs"`. If Chromium is missing when the script first runs, run `npx playwright install chromium`.

- [ ] **Step 2: Write the script**

Create `scripts/generate-scan-label.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "design", "scan-label");

const urlFlag = process.argv.indexOf("--url");
const URL_TO_ENCODE = urlFlag > -1 ? process.argv[urlFlag + 1] : "https://www.sweetshopcentral.com/scan";

const TEAL = "#00727f";
const INK = "#1c1a17";
const CREAM = "#f8ecd0";
const FONT = "'Arial Rounded MT Bold','Segoe UI',Arial,sans-serif";

const qr = QRCode.create(URL_TO_ENCODE, { errorCorrectionLevel: "H" });
const moduleCount = qr.modules.size;
const bits = qr.modules.data;

const plate = { x: 135, y: 148, size: 330, radius: 26 };
const pad = 22;
const qrSize = plate.size - pad * 2;
const cell = qrSize / moduleCount;
const qrX = plate.x + pad;
const qrY = plate.y + pad;

let modules = "";
for (let row = 0; row < moduleCount; row++) {
  for (let col = 0; col < moduleCount; col++) {
    if (bits[row * moduleCount + col]) {
      const side = (cell + 0.35).toFixed(2);
      modules += `M${(qrX + col * cell).toFixed(2)} ${(qrY + row * cell).toFixed(2)}h${side}v${side}h-${side}z`;
    }
  }
}

// About 6% of the QR area; error-correction level H tolerates far more.
const logo = Math.round(qrSize * 0.25);
const logoPlate = logo + 14;
const centerX = plate.x + plate.size / 2;
const centerY = plate.y + plate.size / 2;
const iconBase64 = fs.readFileSync(path.join(outDir, "icon.png")).toString("base64");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <clipPath id="iconClip"><rect x="${centerX - logo / 2}" y="${centerY - logo / 2}" width="${logo}" height="${logo}" rx="${logo * 0.2}"/></clipPath>
  </defs>
  <rect x="0" y="0" width="600" height="600" rx="56" fill="${CREAM}"/>
  <rect x="14" y="14" width="572" height="572" rx="46" fill="none" stroke="${TEAL}" stroke-width="12"/>
  <g font-family="${FONT}" text-anchor="middle">
    <text x="300" y="66" font-size="26" font-weight="700" letter-spacing="6" fill="${INK}">SCAN FOR</text>
    <text x="300" y="126" font-size="66" font-weight="900" fill="${TEAL}">15% OFF</text>
  </g>
  <rect x="${plate.x}" y="${plate.y}" width="${plate.size}" height="${plate.size}" rx="${plate.radius}" fill="#ffffff" stroke="${INK}" stroke-width="5"/>
  <path d="${modules}" fill="${INK}" shape-rendering="crispEdges"/>
  <rect x="${centerX - logoPlate / 2}" y="${centerY - logoPlate / 2}" width="${logoPlate}" height="${logoPlate}" rx="${logoPlate * 0.22}" fill="#ffffff"/>
  <image x="${centerX - logo / 2}" y="${centerY - logo / 2}" width="${logo}" height="${logo}" clip-path="url(#iconClip)" xlink:href="data:image/png;base64,${iconBase64}"/>
  <g font-family="${FONT}" text-anchor="middle">
    <text x="300" y="524" font-size="32" font-weight="800" fill="${INK}">your first order</text>
    <text x="300" y="558" font-size="14" font-weight="600" letter-spacing="0.6" fill="#5b554c">New accounts only  ·  one use per customer</text>
  </g>
</svg>`;

fs.writeFileSync(path.join(outDir, "scan-label.svg"), svg);

const labelHtml = (body) =>
  `<html><head><style>@page{size:2in 2in;margin:0}html,body{margin:0;background:#fff}svg{display:block;width:2in;height:2in}</style></head><body>${body}</body></html>`;

// 12 labels (3 across, 4 down) centred on US Letter; check against your label stock.
const sheetHtml = `<html><head><style>@page{size:8.5in 11in;margin:0}html,body{margin:0;background:#fff}
.grid{display:grid;grid-template-columns:repeat(3,2in);grid-auto-rows:2in;margin:1.5in 1.25in}
svg{display:block;width:2in;height:2in}</style></head><body><div class="grid">${svg.repeat(12)}</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
  await page.screenshot({
    path: path.join(outDir, "scan-label.png"),
    clip: { x: 0, y: 0, width: 600, height: 600 },
  });

  await page.setContent(labelHtml(svg));
  await page.pdf({ path: path.join(outDir, "scan-label.pdf"), width: "2in", height: "2in", printBackground: true });

  await page.setContent(sheetHtml);
  await page.pdf({ path: path.join(outDir, "scan-label-sheet.pdf"), format: "Letter", printBackground: true });
} finally {
  await browser.close();
}

const png = PNG.sync.read(fs.readFileSync(path.join(outDir, "scan-label.png")));
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
if (!decoded || decoded.data !== URL_TO_ENCODE) {
  console.error(`QR self-check failed: expected ${URL_TO_ENCODE}, decoded ${decoded ? decoded.data : "nothing"}`);
  process.exit(1);
}

const moduleMm = ((50.8 * (qrSize / 600)) / moduleCount).toFixed(2);
console.log(`OK: ${URL_TO_ENCODE} (${moduleCount}x${moduleCount} modules, ${moduleMm} mm each on a 2in label)`);
```

- [ ] **Step 3: Run**

`npm run label:scan` — Expected: prints `OK: https://www.sweetshopcentral.com/scan (37x37 modules, 0.65 mm each on a 2in label)` and exits 0; the four output files exist in `design/scan-label/` (`scan-label.png` 1200×1200). Also run `npm run label:scan -- --url https://example.com/x` and confirm it exits 0 too, then re-run the default so the committed artwork is the real-URL version. Read `design/scan-label/scan-label.png` and confirm it visually shows the headline, QR with the cupcake in the centre, and fine print, with nothing overlapping.

- [ ] **Step 4: Lint and typecheck**

`npm run lint` — Expected: no errors (the script is linted as `.mjs`). `npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-scan-label.mjs design/scan-label package.json package-lock.json
git commit -m "feat: generate the scan-offer sticker artwork with a self-verifying QR"
```

---

### Task 10: One-off script to create the `SCAN15` promotion (do NOT run)

**Files:**
- Create: `scripts/create-scan-offer-promo.ts`

- [ ] **Step 1: Write the script**

Create `scripts/create-scan-offer-promo.ts`, modelled on `scripts/create-qr-promo.ts`:

```ts
/**
 * One-off (not part of the app runtime): creates the SCAN15 promotion for the
 * QR-sticker welcome offer (15% off a customer's first order). Run ONLY after
 * the code that understands first_order_only is deployed - see the scan-offer
 * design spec, Rollout. No usage limit or expiry: it goes out on physical
 * stickers indefinitely. Safe to re-run: it updates the existing row.
 *
 * Usage: npx tsx --env-file=.env.local scripts/create-scan-offer-promo.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/supabase";
import { SCAN_OFFER_CODE } from "../src/lib/promotions/scan-offer";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const admin = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin
    .from("promotions")
    .upsert(
      {
        code: SCAN_OFFER_CODE,
        discount_type: "percent",
        value: 15,
        first_order_only: true,
        usage_limit: null,
        expires_at: null,
      },
      { onConflict: "code" }
    )
    .select()
    .single();

  if (error) throw error;
  console.log("SCAN15 promotion ready:", data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify without running it**

`npm run typecheck` — Expected: PASS (`scripts/` is type-checked with the project). `npm run lint` — Expected: no errors. Do NOT execute the script.

- [ ] **Step 3: Commit**

```bash
git add scripts/create-scan-offer-promo.ts
git commit -m "chore: add the one-off script that creates the SCAN15 promotion"
```

---

### Task 11: Full checkpoint (controller-run, verification only)

**Files:** none.

- [ ] **Step 1: Run one command at a time (never concurrently), capturing real exit codes**

```bash
npm run typecheck
npm run lint
npx vitest run tests/unit
npx vitest run tests/integration/scan-offer-foundations.test.ts tests/integration/checkout-session-route.test.ts tests/integration/checkout-payment-intent-route.test.ts tests/integration/checkout-webhook-route.test.ts tests/integration/payment-intent-webhook.test.ts tests/integration/auth-signup-route.test.ts tests/integration/rewards-referrals-foundations.test.ts tests/integration/admin-promotions-route.test.ts
npx playwright test tests/e2e/scan-offer.spec.ts tests/e2e/cart.spec.ts tests/e2e/route-groups.spec.ts
npm run build
npm run label:scan
```

Expected: all PASS. Then run the complete `npx vitest run` once and compare with the pre-change baseline recorded in the ledger (any failure in an untouched area is investigated as pre-existing vs regression before merging).

- [ ] **Step 2: Confirm the shared DB is clean**

No `TESTOFFER…`/`E2EOFFER…` promotions, no `test-scan-`/`test-e2e-scan-` users, no `promotion_redemptions` rows for test users remain.

- [ ] **Step 3: Hand the artwork to Ted**

Send `design/scan-label/scan-label.png` (and mention the PDF/sheet paths). Remind Ted: do not print until the offer is live (Gate B), and do a two-phone scan test of a printed proof first.
