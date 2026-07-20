export const SNACK_ONLY_FREE_SHIPPING_THRESHOLD_CENTS = 2500;
export const SNACK_ONLY_SHIPPING_FEE_CENTS = 500;

export interface CartLineForTotal {
  itemType: "box" | "snack";
  unitPriceCents: number;
  quantity: number;
}

export interface CartTotal {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  hasBox: boolean;
}

/**
 * Pure, DB-free so the roadmap's own completion criterion ("cart total is
 * correct for a mixed cart") is verifiable without a round trip. Shipping
 * rule (Milestone 5 plan, Product Decision #6 / roadmap open decision #5,
 * approved 2026-07-20): a cart with zero box lines (curated, mystery, or
 * build_a_box - build_a_box lines are inserted as item_type='box', see the
 * cart_items schema) and a subtotal under $25 gets a flat $5 shipping fee.
 * Any box present, or a snack-only subtotal of $25+, ships free.
 */
export function calculateCartTotal(lines: CartLineForTotal[]): CartTotal {
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const hasBox = lines.some((line) => line.itemType === "box");

  const shippingCents =
    lines.length > 0 && !hasBox && subtotalCents < SNACK_ONLY_FREE_SHIPPING_THRESHOLD_CENTS
      ? SNACK_ONLY_SHIPPING_FEE_CENTS
      : 0;

  return {
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    hasBox,
  };
}
