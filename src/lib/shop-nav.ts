/**
 * Milestone 18: the seven storefront destinations Ted wants reachable by
 * choosing them directly, rather than filtering one shared /shop grid.
 * Shared between the homepage tile grid and SiteHeader's nav row so the
 * two never drift out of sync on label/href.
 */
export const SHOP_CATEGORY_LINKS = [
  { href: "/shop/snack-boxes", label: "Snack Boxes" },
  { href: "/shop/candy-boxes", label: "Candy Boxes" },
  { href: "/shop/mystery-box", label: "Mystery Box" },
  { href: "/shop/build-a-box", label: "Build-a-Box" },
  { href: "/shop/merch", label: "Merchandise" },
  { href: "/account/rewards", label: "Rewards" },
  { href: "/account/referrals", label: "Referrals" },
] as const;
