import { getSellableSnacks } from "@/lib/supabase/queries/catalog";
import { catalogQuerySchema } from "@/lib/validations/catalog";
import { excludeHouseSnacks } from "@/lib/shop/exclude-house-snacks";
import { SnackGrid } from "@/components/features/shop/snack-grid";
import { SnackCategoryChips } from "@/components/features/shop/snack-category-chips";

export const revalidate = 60;

export const metadata = {
  title: "Snacks | The Sweet Shop",
  description: "Individual snacks you can buy on their own, or pick for Build-a-Box.",
};

interface SnacksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SnacksPage({ searchParams }: SnacksPageProps) {
  const rawParams = await searchParams;
  const query = catalogQuerySchema.pick({ category: true }).parse({
    category: typeof rawParams.category === "string" ? rawParams.category : undefined,
  });

  const allSnacks = await getSellableSnacks({ category: query.category });
  // House Snacks has its own dedicated page/tile (see house-snacks/page.tsx)
  // - excluded here unconditionally so it never doubles up with this
  // general listing, matching Ted's "house snacks should be their own
  // category" answer.
  const snacks = excludeHouseSnacks(allSnacks);

  return (
    <SnackGrid
      title="Snacks"
      description="Chips, candy, cookies, and more — buy them on their own, or pick your favorites for Build-a-Box."
      snacks={snacks}
      emptyMessage="No snacks are live yet — check back soon."
      filters={<SnackCategoryChips basePath="/shop/snacks" selectedCategory={query.category} />}
    />
  );
}
