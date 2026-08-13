import { SnackCategoryScreen } from "../../components/shared/SnackCategoryScreen";

export function HouseSnacksScreen() {
  return (
    <SnackCategoryScreen
      fixedCategory="house_snacks"
      heading="House Snacks"
      subtitle="Made in-house by us — trail mix, dipped cookies, loaded rice krispie treats, and more."
      emptyMessage="No House Snacks are live yet — check back soon."
    />
  );
}
