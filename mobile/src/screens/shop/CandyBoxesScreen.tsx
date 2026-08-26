import { BoxCategoryScreen } from "../../components/shared/BoxCategoryScreen";

export function CandyBoxesScreen() {
  return (
    <BoxCategoryScreen
      category="candy_box"
      heading="Candy Boxes"
      subtitle="A curated mix of candy, packed into one box."
      emptyMessage="No Candy Boxes are live yet — check back soon."
    />
  );
}
