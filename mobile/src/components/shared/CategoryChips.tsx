import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, radii, spacing, typography } from "../../theme";

/**
 * Mirrors the SNACK_FILTER_CATEGORIES constant web's
 * snack-category-chips.tsx carries. house_snacks kept in this full list
 * since this component is generic; the new SnacksScreen (Milestone 19)
 * passes `categories={CATEGORIES.filter((c) => c !== "house_snacks")}`
 * since House Snacks now has its own dedicated screen/tile rather than
 * being a sub-filter within general Snacks. cakes added the same
 * milestone for honey buns/pies.
 */
export const CATEGORIES = [
  "house_snacks",
  "cakes",
  "candy",
  "chips",
  "cookies",
  "spicy",
  "salty",
  "sweet",
  "international",
] as const;

interface CategoryChipsProps {
  selected: string | undefined;
  onSelect: (category: string | undefined) => void;
  /** Defaults to the full CATEGORIES list. */
  categories?: readonly string[];
}

// CSS text-transform: capitalize only capitalizes per word (space-separated),
// so "house_snacks" would render as "House_snacks" with the underscore
// showing - display labels are spelled out here instead.
const CATEGORY_LABELS: Record<string, string> = {
  house_snacks: "House Snacks",
};

export function CategoryChips({ selected, onSelect, categories = CATEGORIES }: CategoryChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {categories.map((category) => {
        const active = selected === category;
        return (
          <Pressable
            key={category}
            onPress={() => onSelect(active ? undefined : category)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {CATEGORY_LABELS[category] ?? category}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    ...typography.sizes.sm,
    color: colors.foreground,
    textTransform: "capitalize",
  },
  labelActive: {
    color: colors.primaryForeground,
    fontFamily: typography.fontFamilyMedium,
  },
});
