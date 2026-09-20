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
