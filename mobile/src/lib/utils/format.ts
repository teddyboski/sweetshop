/** Mirrors src/lib/utils.ts's formatPriceCents on the web side exactly. */
export function formatPriceCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Mirrors src/lib/utils.ts's formatDate on the web side exactly. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
