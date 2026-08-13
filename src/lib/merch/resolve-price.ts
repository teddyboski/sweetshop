/**
 * A merch_variants row's price_cents_override is nullable - a variant only
 * overrides price when it needs to (e.g. an XL shirt costs more than a
 * Medium); most variants of most items share the parent item's base price.
 * Pure and DB-free so it's directly unit-testable, matching this repo's
 * own precedent (calculateCartTotal in lib/cart/calculate-total.ts).
 */
export function resolveMerchPriceCents(
  merchItem: { price_cents: number },
  variant: { price_cents_override: number | null }
): number {
  return variant.price_cents_override ?? merchItem.price_cents;
}
