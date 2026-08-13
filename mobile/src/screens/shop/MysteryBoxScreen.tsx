import { BoxCategoryScreen } from "../../components/shared/BoxCategoryScreen";

export function MysteryBoxScreen() {
  return (
    <BoxCategoryScreen
      category="mystery_box"
      heading="Mystery Box"
      subtitle="Surprise contents, rotating regularly."
      emptyMessage="No Mystery Boxes are live yet — check back soon."
    />
  );
}
