import { getSellableSnacks } from "@/lib/supabase/queries/catalog";
import { SnackGrid } from "@/components/features/shop/snack-grid";

export const revalidate = 60;

export const metadata = {
  title: "House Snacks | The Sweet Shop",
  description: "Made in-house by us — trail mix, dipped cookies, and more.",
};

export default async function HouseSnacksPage() {
  const snacks = await getSellableSnacks({ category: "house_snacks" });

  return (
    <SnackGrid
      title="House Snacks"
      description="Made in-house by us — trail mix, dipped cookies, loaded rice krispie treats, and more."
      snacks={snacks}
      emptyMessage="No House Snacks are live yet — check back soon."
    />
  );
}
