import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchBoxes, type CatalogBox } from "../../lib/api/catalog";
import { ProductCard } from "./ProductCard";
import { SkeletonCard } from "./SkeletonCard";
import { colors, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Nav = NativeStackNavigationProp<ShopStackParamList>;

interface BoxCategoryScreenProps {
  category: "snack_box" | "candy_box" | "mystery_box";
  heading: string;
  subtitle: string;
  /**
   * Shown when this category has zero active boxes. Milestone 18 ships
   * the `category` column and these screens with nothing tagged yet -
   * Ted tags boxes with a category from Admin -> Boxes as his own
   * data-entry task, so an empty state at launch is expected, not a bug.
   */
  emptyMessage: string;
}

/** Shared screen for the new per-category box tabs (Snack Boxes, Candy
 * Boxes, Mystery Box), mirroring the web BoxCategoryGrid component and
 * this app's existing DropsScreen loading/error/empty-state pattern. */
export function BoxCategoryScreen({ category, heading, subtitle, emptyMessage }: BoxCategoryScreenProps) {
  const navigation = useNavigation<Nav>();
  const { data, isPending, isError } = useQuery({
    queryKey: ["catalog", "boxes", category],
    queryFn: () => fetchBoxes({ category }),
  });

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
      data={data ?? []}
      keyExtractor={(box: CatalogBox) => box.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={
        <>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </>
      }
      ListEmptyComponent={
        <View style={styles.centerState}>
          <Ionicons name="cube-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      }
      renderItem={({ item: box }) => (
        <ProductCard
          title={box.title}
          priceCents={box.price_cents}
          imageUrl={box.imageUrl}
          subtitle={box.is_subscription ? `/ ${box.cadence}` : undefined}
          onPress={() => navigation.navigate("BoxDetail", { slug: box.slug })}
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
