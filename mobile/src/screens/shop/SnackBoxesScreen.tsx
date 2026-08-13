import { BoxCategoryScreen } from "../../components/shared/BoxCategoryScreen";

export function SnackBoxesScreen() {
  return (
    <BoxCategoryScreen
      category="snack_box"
      heading="Snack Boxes"
      subtitle="Hand-packed boxes of chips, cookies & more."
      emptyMessage="No Snack Boxes are live yet — check back soon."
    />
  );
}
