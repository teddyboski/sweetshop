import { describe, it, expect } from "vitest";
import { calculateCartTotal } from "@/lib/cart/calculate-total";

describe("calculateCartTotal", () => {
  it("computes the correct total for a mixed cart (1 box + 2 loose snacks + 1 BYO box)", () => {
    const result = calculateCartTotal([
      { itemType: "box", unitPriceCents: 1500, quantity: 1 }, // curated box
      { itemType: "snack", unitPriceCents: 300, quantity: 1 },
      { itemType: "snack", unitPriceCents: 350, quantity: 1 },
      { itemType: "box", unitPriceCents: 1500, quantity: 1 }, // build-a-box, item_type is 'box'
    ]);

    expect(result.subtotalCents).toBe(1500 + 300 + 350 + 1500);
    expect(result.hasBox).toBe(true);
    expect(result.shippingCents).toBe(0);
    expect(result.totalCents).toBe(result.subtotalCents);
  });

  it("adds a $5 shipping fee to a snack-only cart under $25", () => {
    const result = calculateCartTotal([
      { itemType: "snack", unitPriceCents: 300, quantity: 2 },
      { itemType: "snack", unitPriceCents: 350, quantity: 1 },
    ]);

    expect(result.subtotalCents).toBe(950);
    expect(result.hasBox).toBe(false);
    expect(result.shippingCents).toBe(500);
    expect(result.totalCents).toBe(1450);
  });

  it("does not add a shipping fee to a snack-only cart at or over $25", () => {
    const result = calculateCartTotal([{ itemType: "snack", unitPriceCents: 2500, quantity: 1 }]);

    expect(result.subtotalCents).toBe(2500);
    expect(result.shippingCents).toBe(0);
    expect(result.totalCents).toBe(2500);
  });

  it("never adds a shipping fee when any box is present, regardless of subtotal", () => {
    const result = calculateCartTotal([
      { itemType: "box", unitPriceCents: 1500, quantity: 1 },
      { itemType: "snack", unitPriceCents: 300, quantity: 1 },
    ]);

    expect(result.subtotalCents).toBe(1800);
    expect(result.shippingCents).toBe(0);
  });

  it("returns zero totals for an empty cart", () => {
    const result = calculateCartTotal([]);
    expect(result.subtotalCents).toBe(0);
    expect(result.shippingCents).toBe(0);
    expect(result.totalCents).toBe(0);
    expect(result.hasBox).toBe(false);
  });

  it("accounts for quantity greater than 1", () => {
    const result = calculateCartTotal([{ itemType: "box", unitPriceCents: 1500, quantity: 3 }]);
    expect(result.subtotalCents).toBe(4500);
  });
});
