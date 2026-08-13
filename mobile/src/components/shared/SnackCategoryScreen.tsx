import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchSnacks, type CatalogSnack } from "../../lib/api/catalog";
import { ProductCard } from "./ProductCard";
import { SkeletonCard } from "./SkeletonCard";
import { CategoryChips, CATEGORIES } from "./CategoryChips";
import { colors, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Nav = NativeStackNavigationProp<ShopStackParamList>;

interface SnackCategoryScreenProps {
  /** Fixed category filter (e.g. "house_snacks") - hides the chips row, this screen only ever shows that one category. */
  fixedCategory?: string;
  /** House Snacks has its own screen/tile now (Milestone 19) - excluded from the general Snacks screen's chip row so it's never a sub-filter of itself. */
  excludeFromChips?: string;
  heading: string;
  subtitle: string;
  emptyMessage: string;
}

/**
 * Shared screen for the individually-sellable-snacks screens (Snacks,
 * House Snacks), mirroring BoxCategoryScreen's loading/error/empty
 * pattern. Snacks (no fixedCategory) gets an interactive CategoryChips
 * filter row for browsing by flavor/type; House Snacks (fixedCategory
 * set) doesn't need one, it's already a single category.
 */
export function SnackCategoryScreen({
  fixedCategory,
  excludeFromChips,
  heading,
  subtitle,
  emptyMessage,
}: SnackCategoryScreenProps) {
  const navigation = useNavigation<Nav>();
  const [chipCategory, setChipCategory] = useState<string | undefined>(undefined);
  const category = fixedCategory ?? chipCategory;

  const { data, isPending, isError } = useQuery({
    queryKey: ["catalog", "snacks", category ?? "all"],
    queryFn: () => fetchSnacks({ category }),
  });

  // House Snacks is excluded from the general Snacks screen unconditionally,
  // same as the web SnacksPage - it has its own screen/tile now, so it
  // never doubles up here even on the unfiltered ("All") view.
  const snacks = fixedCategory ? (data ?? []) : (data ?? []).filter((snack) => snack.category !== "house_snacks");

  const chipCategories = excludeFromChips ? CATEGORIES.filter((c) => c !== excludeFromChips) : CATEGORIES;

  if (isPending) {
    return (
      <View style={styles.content}>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Couldn't load {heading.toLowerCase()}.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={snacks}
      keyExtractor={(snack: CatalogSnack) => snack.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={
        <>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {!fixedCategory && (
            <View style={styles.chipsWrap}>
              <CategoryChips categories={chipCategories} selected={chipCategory} onSelect={setChipCategory} />
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      }
      renderItem={({ item: snack }) => (
        <ProductCard
          title={snack.name}
          priceCents={snack.price_cents}
          imageUrl={snack.imageUrl}
          onPress={() => navigation.navigate("SnackDetail", { slug: snack.slug })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing["4xl"],
  },
  heading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  subtitle: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  chipsWrap: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing["3xl"],
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
