import { describe, it, expect } from "vitest";
import { resolveMerchPriceCents } from "@/lib/merch/resolve-price";

describe("resolveMerchPriceCents", () => {
  it("falls back to the item's base price when the variant has no override", () => {
    const price = resolveMerchPriceCents({ price_cents: 2400 }, { price_cents_override: null });
    expect(price).toBe(2400);
  });

  it("uses the variant's override when set", () => {
    const price = resolveMerchPriceCents({ price_cents: 2400 }, { price_cents_override: 2800 });
    expect(price).toBe(2800);
  });

  it("treats a zero override as a real override, not a missing one", () => {
    // Not a realistic price in practice (createMerchVariantSchema requires
    // positive), but resolveMerchPriceCents itself is a pure fallback
    // function and shouldn't silently treat 0 as "unset" via truthiness.
    const price = resolveMerchPriceCents({ price_cents: 2400 }, { price_cents_override: 0 });
    expect(price).toBe(0);
  });
});
