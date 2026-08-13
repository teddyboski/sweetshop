import { getActiveBoxes } from "@/lib/supabase/queries/catalog";
import { BoxCategoryGrid } from "@/components/features/shop/box-category-grid";

export const revalidate = 60;

export const metadata = {
  title: "Candy Boxes | The Sweet Shop",
  description: "Curated candy boxes, hand-packed to order.",
};

export default async function CandyBoxesPage() {
  const boxes = await getActiveBoxes({ category: "candy_box" });
  return (
    <BoxCategoryGrid
      title="Candy Boxes"
      description="A hand-picked mix of candy, packed into one box."
      boxes={boxes}
      emptyMessage="No Candy Boxes are live yet — check back soon."
    />
  );
}
