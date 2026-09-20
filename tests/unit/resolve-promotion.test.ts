import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { resolvePromotion, OFFER_CHECK_UNAVAILABLE_MESSAGE } from "@/lib/promotions/resolve-promotion";

// A real database cannot be made to fail on demand, so the fail-closed paths are
// exercised against a minimal chainable stub of the few query shapes
// resolvePromotion uses. It is cast once to the client type.
type QueryResult = { data: unknown; error: { message: string } | null };

interface QueryBuilder {
  select: () => QueryBuilder;
  eq: () => QueryBuilder;
  in: () => QueryBuilder;
  is: () => QueryBuilder;
  limit: () => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  then: (onFulfilled: (result: QueryResult) => unknown) => Promise<unknown>;
}

function createStub(results: Record<string, QueryResult>) {
  const requestedTables: string[] = [];
  const client = {
    from(table: string): QueryBuilder {
      requestedTables.push(table);
      const result = results[table] ?? { data: null, error: null };
      const builder: QueryBuilder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        is: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
      };
      return builder;
    },
  };
  return { admin: client as unknown as SupabaseClient<Database>, requestedTables };
}

const DB_ERROR = { message: "connection reset" };

function promotionRow(overrides: Partial<{ first_order_only: boolean }> = {}): QueryResult {
  return {
    data: {
      id: "promo-1",
      code: "SCAN15",
      discount_type: "percent",
      value: 15,
      usage_limit: null,
      used_count: 0,
      expires_at: null,
      first_order_only: true,
      ...overrides,
    },
    error: null,
  };
}

const NO_PROMOTION = { ok: true, promotionId: null, discountCents: 0, description: null };

describe("resolvePromotion fails closed on eligibility lookups", () => {
  it("returns 503 for a typed first-order-only code when the orders query errors", async () => {
    const { admin } = createStub({
      promotions: promotionRow(),
      orders: { data: null, error: DB_ERROR },
      promotion_redemptions: { data: [], error: null },
    });

    const result = await resolvePromotion(admin, { userId: "user-1", promoCode: "scan15", subtotalCents: 1000 });

    expect(result).toEqual({ ok: false, status: 503, message: OFFER_CHECK_UNAVAILABLE_MESSAGE });
  });

  it("returns 503 for a typed first-order-only code when the redemptions query errors", async () => {
    const { admin } = createStub({
      promotions: promotionRow(),
      orders: { data: [], error: null },
      promotion_redemptions: { data: null, error: DB_ERROR },
    });

    const result = await resolvePromotion(admin, { userId: "user-1", promoCode: "scan15", subtotalCents: 1000 });

    expect(result).toEqual({ ok: false, status: 503, message: OFFER_CHECK_UNAVAILABLE_MESSAGE });
  });

  it("gives no discount, silently, when the orders query errors during auto-apply", async () => {
    const { admin } = createStub({
      profiles: { data: { signup_offer_code: "SCAN15" }, error: null },
      promotions: promotionRow(),
      orders: { data: null, error: DB_ERROR },
      promotion_redemptions: { data: [], error: null },
    });

    const result = await resolvePromotion(admin, { userId: "user-1", subtotalCents: 1000 });

    expect(result).toEqual(NO_PROMOTION);
  });
});

describe("resolvePromotion auto-apply", () => {
  it("never auto-applies a promotion that is not first-order-only", async () => {
    const { admin, requestedTables } = createStub({
      profiles: { data: { signup_offer_code: "SCAN15" }, error: null },
      promotions: promotionRow({ first_order_only: false }),
    });

    const result = await resolvePromotion(admin, { userId: "user-1", subtotalCents: 1000 });

    expect(result).toEqual(NO_PROMOTION);
    expect(requestedTables).not.toContain("orders");
    expect(requestedTables).not.toContain("promotion_redemptions");
  });

  it("still applies the welcome offer to an eligible customer", async () => {
    const { admin } = createStub({
      profiles: { data: { signup_offer_code: "SCAN15" }, error: null },
      promotions: promotionRow(),
      orders: { data: [], error: null },
      promotion_redemptions: { data: [], error: null },
    });

    const result = await resolvePromotion(admin, { userId: "user-1", subtotalCents: 1000 });

    expect(result).toEqual({ ok: true, promotionId: "promo-1", discountCents: 150, description: "15% off" });
  });
});

describe("resolvePromotion typed ordinary codes", () => {
  it("does not query orders or redemptions for a code that is not first-order-only", async () => {
    const { admin, requestedTables } = createStub({
      promotions: promotionRow({ first_order_only: false }),
    });

    const result = await resolvePromotion(admin, { userId: "user-1", promoCode: "SCAN15", subtotalCents: 1000 });

    expect(result).toEqual({ ok: true, promotionId: "promo-1", discountCents: 150, description: "15% off" });
    expect(requestedTables).toEqual(["promotions"]);
  });
});
