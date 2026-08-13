/**
 * House Snacks got its own dedicated storefront page/tile in Milestone 19
 * (it used to be a special-cased shelf on the homepage, mobile-only, per
 * Ted's own "house snacks seem to fall on the shop home page" flag). The
 * general Snacks page must never also show them, or the two pages would
 * duplicate the same items - this is the one piece of new filtering logic
 * that milestone adds, so it's pulled out as a small pure function rather
 * than an inline `.filter()`, matching this repo's own precedent
 * (resolveMerchPriceCents) for keeping DB-free logic directly
 * unit-testable.
 */
export function excludeHouseSnacks<T extends { category: string | null }>(snacks: T[]): T[] {
  return snacks.filter((snack) => snack.category !== "house_snacks");
}
