export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;

export const BOX_SHIPPING_SMALL_CENTS = 499;
export const BOX_SHIPPING_MEDIUM_CENTS = 599;
export const BOX_SHIPPING_LARGE_CENTS = 699;
export const SNACK_SHIPPING_CENTS = 199;
export const MERCH_SHIPPING_CENTS = 699;

export interface CartLineForTotal {
  itemType: "box" | "snack" | "merch";
  unitPriceCents: number;
  quantity: number;
  slotCount?: number | null;
}

export interface CartTotal {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  hasBox: boolean;
}

function boxShippingCents(slotCount: number | null | undefined): number {
  if (slotCount === 12) return BOX_SHIPPING_SMALL_CENTS;
  if (slotCount === 30) return BOX_SHIPPING_LARGE_CENTS;
  return BOX_SHIPPING_MEDIUM_CENTS;
}

export function calculateCartTotal(lines: CartLineForTotal[]): CartTotal {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0
  );

  const hasBox = lines.some((line) => line.itemType === "box");

  let shippingCents = 0;
  if (lines.length > 0 && subtotalCents < FREE_SHIPPING_THRESHOLD_CENTS) {
    for (const line of lines) {
      if (line.itemType === "box") {
        shippingCents += boxShippingCents(line.slotCount);
      } else if (line.itemType === "snack") {
        shippingCents += SNACK_SHIPPING_CENTS;
      } else if (line.itemType === "merch") {
        shippingCents += MERCH_SHIPPING_CENTS;
      }
    }
  }

  return {
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    hasBox,
  };
}
