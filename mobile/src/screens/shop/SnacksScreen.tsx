import { SnackCategoryScreen } from "../../components/shared/SnackCategoryScreen";

export function SnacksScreen() {
  return (
    <SnackCategoryScreen
      excludeFromChips="house_snacks"
      heading="Snacks"
      subtitle="Chips, candy, cookies, and more — buy them on their own, or pick your favorites for Build-a-Box."
      emptyMessage="No snacks match this filter."
    />
  );
}
