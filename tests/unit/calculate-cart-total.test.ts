import { describe, it, expect } from "vitest";
import {
  calculateCartTotal,
  FREE_SHIPPING_THRESHOLD_CENTS,
  BOX_SHIPPING_SMALL_CENTS,
  BOX_SHIPPING_MEDIUM_CENTS,
  BOX_SHIPPING_LARGE_CENTS,
  SNACK_SHIPPING_CENTS,
  MERCH_SHIPPING_CENTS,
} from "@/lib/cart/calculate-total";

describe("calculateCartTotal", () => {
  it("returns zero totals for an empty cart", () => {
    const result = calculateCartTotal([]);
    expect(result.subtotalCents).toBe(0);
    expect(result.shippingCents).toBe(0);
    expect(result.totalCents).toBe(0);
    expect(result.hasBox).toBe(false);
  });

  it("accounts for quantity greater than 1 in subtotal", () => {
    const result = calculateCartTotal([{ itemType: "box", unitPriceCents: 1500, quantity: 3, slotCount: 20 }]);
    expect(result.subtotalCents).toBe(4500);
  });

  it("charges medium box shipping for a 20-slot box", () => {
    const result = calculateCartTotal([{ itemType: "box", unitPriceCents: 2499, quantity: 1, slotCount: 20 }]);
    expect(result.shippingCents).toBe(BOX_SHIPPING_MEDIUM_CENTS);
  });

  it("charges small box shipping for a 12-slot box", () => {
    const result = calculateCartTotal([{ itemType: "box", unitPriceCents: 1499, quantity: 1, slotCount: 12 }]);
    expect(result.shippingCents).toBe(BOX_SHIPPING_SMALL_CENTS);
  });

  it("charges large box shipping for a 30-slot box", () => {
    const result = calculateCartTotal([{ itemType: "box", unitPriceCents: 3499, quantity: 1, slotCount: 30 }]);
    expect(result.shippingCents).toBe(BOX_SHIPPING_LARGE_CENTS);
  });

  it("charges snack shipping per snack line", () => {
    const result = calculateCartTotal([
      { itemType: "snack", unitPriceCents: 799, quantity: 1 },
      { itemType: "snack", unitPriceCents: 999, quantity: 2 },
    ]);
    expect(result.shippingCents).toBe(SNACK_SHIPPING_CENTS * 2);
  });

  it("charges merch shipping per merch line", () => {
    const result = calculateCartTotal([{ itemType: "merch", unitPriceCents: 2999, quantity: 1 }]);
    expect(result.shippingCents).toBe(MERCH_SHIPPING_CENTS);
  });

  it("sums shipping across mixed cart types", () => {
    const result = calculateCartTotal([
      { itemType: "box", unitPriceCents: 2499, quantity: 1, slotCount: 20 },
      { itemType: "snack", unitPriceCents: 799, quantity: 1 },
      { itemType: "merch", unitPriceCents: 2999, quantity: 1 },
    ]);
    expect(result.shippingCents).toBe(
      BOX_SHIPPING_MEDIUM_CENTS + SNACK_SHIPPING_CENTS + MERCH_SHIPPING_CENTS
    );
  });

  it("waives all shipping when subtotal reaches the free threshold", () => {
    const result = calculateCartTotal([
      { itemType: "box", unitPriceCents: FREE_SHIPPING_THRESHOLD_CENTS, quantity: 1, slotCount: 20 },
    ]);
    expect(result.shippingCents).toBe(0);
  });

  it("still charges shipping one cent below the free threshold", () => {
    const result = calculateCartTotal([
      { itemType: "box", unitPriceCents: FREE_SHIPPING_THRESHOLD_CENTS - 1, quantity: 1, slotCount: 20 },
    ]);
    expect(result.shippingCents).toBe(BOX_SHIPPING_MEDIUM_CENTS);
  });

  it("sets hasBox correctly", () => {
    const withBox = calculateCartTotal([{ itemType: "box", unitPriceCents: 1500, quantity: 1, slotCount: 20 }]);
    const noBox = calculateCartTotal([{ itemType: "snack", unitPriceCents: 500, quantity: 1 }]);
    expect(withBox.hasBox).toBe(true);
    expect(noBox.hasBox).toBe(false);
  });

  it("quantity does not multiply shipping — one rate per line regardless of units", () => {
    const qty1 = calculateCartTotal([{ itemType: "snack", unitPriceCents: 799, quantity: 1 }]);
    const qty5 = calculateCartTotal([{ itemType: "snack", unitPriceCents: 799, quantity: 5 }]);
    expect(qty1.shippingCents).toBe(qty5.shippingCents);
  });
});
