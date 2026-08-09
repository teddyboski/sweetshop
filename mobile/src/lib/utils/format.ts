/** Mirrors src/lib/utils.ts's formatPriceCents on the web side exactly. */
export function formatPriceCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
