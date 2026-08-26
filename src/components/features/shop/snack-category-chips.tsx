import Link from "next/link";

/**
 * Mirrors the CATEGORIES constant mobile's CategoryChips.tsx already
 * carries (which itself mirrored the pill nav (shop)/shop/page.tsx had
 * before Milestone 18 removed it). house_snacks is deliberately excluded
 * here - House Snacks now has its own dedicated page/tile, so it's not a
 * sub-filter within the general Snacks page anymore. "cakes" added per
 * Ted: honey buns/pies get their own identifiable category, tagged the
 * same way as chips/candy/cookies/etc rather than a separate top-level
 * destination.
 */
export const SNACK_FILTER_CATEGORIES = ["cakes", "candy", "chips", "cookies", "spicy", "salty", "sweet", "international"];

interface SnackCategoryChipsProps {
  basePath: string;
  selectedCategory: string | undefined;
}

/**
 * Server Component, Link-based filter pills - no client-side state, same
 * pattern the pre-Milestone-18 (shop)/shop/page.tsx pill nav used. Scoped
 * to the new Snacks page rather than reviving the old page-wide nav
 * Milestone 18 intentionally removed (that one filtered box categories
 * that now each have their own page; this filters snack flavor/type
 * within a single page, a different, finer-grained concern).
 */
export function SnackCategoryChips({ basePath, selectedCategory }: SnackCategoryChipsProps) {
  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filter by category">
      {SNACK_FILTER_CATEGORIES.map((category) => {
        const active = selectedCategory === category;
        return (
          <Link
            key={category}
            href={active ? basePath : `${basePath}?category=${category}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {category}
          </Link>
        );
      })}
    </nav>
  );
}
