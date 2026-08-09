import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, radii, spacing, typography } from "../../theme";

/** Mirrors the CATEGORIES constant in (shop)/shop/page.tsx exactly. */
export const CATEGORIES = ["candy", "chips", "cookies", "spicy", "salty", "sweet", "international"] as const;

interface CategoryChipsProps {
  selected: string | undefined;
  onSelect: (category: string | undefined) => void;
}

export function CategoryChips({ selected, onSelect }: CategoryChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {CATEGORIES.map((category) => {
        const active = selected === category;
        return (
          <Pressable
            key={category}
            onPress={() => onSelect(active ? undefined : category)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{category}</Text>
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
