import { getActiveBoxes } from "@/lib/supabase/queries/catalog";
import { BoxCategoryGrid } from "@/components/features/shop/box-category-grid";

export const revalidate = 60;

export const metadata = {
  title: "Snack Boxes | The Sweet Shop",
  description: "Hand-packed snack boxes, ready to ship.",
};

export default async function SnackBoxesPage() {
  const boxes = await getActiveBoxes({ category: "snack_box" });
  return (
    <BoxCategoryGrid
      title="Snack Boxes"
      description="Hand-packed boxes of chips, cookies, and more — pick one and go."
      boxes={boxes}
      emptyMessage="No Snack Boxes are live yet — check back soon."
    />
  );
}
