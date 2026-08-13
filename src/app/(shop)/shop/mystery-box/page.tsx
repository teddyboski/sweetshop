import { getActiveBoxes } from "@/lib/supabase/queries/catalog";
import { BoxCategoryGrid } from "@/components/features/shop/box-category-grid";

export const revalidate = 60;

export const metadata = {
  title: "Mystery Box | The Sweet Shop",
  description: "Rotating surprise boxes — contents change regularly.",
};

export default async function MysteryBoxPage() {
  const boxes = await getActiveBoxes({ category: "mystery_box" });
  return (
    <BoxCategoryGrid
      title="Mystery Box"
      description="Surprise contents, rotating regularly — no two are quite the same."
      boxes={boxes}
      emptyMessage="No Mystery Boxes are live yet — check back soon."
    />
  );
}
