import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchBoxes, fetchSnacks } from "../../lib/api/catalog";
import { ProductCard } from "../../components/shared/ProductCard";
import { SkeletonCard } from "../../components/shared/SkeletonCard";
import { CategoryChips } from "../../components/shared/CategoryChips";
import { colors, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Nav = NativeStackNavigationProp<ShopStackParamList, "ShopHome">;

/**
 * Milestone 12: real catalog browsing, replacing the M11 placeholder.
 * Search has its own dedicated tab (SearchScreen) rather than duplicating a
 * search bar here - keeps this screen focused on browsing + category
 * filtering, one clear job per tab.
 */
export function ShopHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [category, setCategory] = useState<string | undefined>(undefined);

  const boxesQuery = useQuery({ queryKey: ["catalog", "boxes"], queryFn: fetchBoxes });
  const snacksQuery = useQuery({
    queryKey: ["catalog", "snacks", category],
    queryFn: () => fetchSnacks({ category }),
  });

  const refreshing = boxesQuery.isRefetching || snacksQuery.isRefetching;
  const onRefresh = useCallback(() => {
    boxesQuery.refetch();
    snacksQuery.refetch();
  }, [boxesQuery, snacksQuery]);

  const isInitialLoading = boxesQuery.isPending || snacksQuery.isPending;
  const hasError = boxesQuery.isError || snacksQuery.isError;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.pageHeading}>Shop</Text>
      <Text style={styles.pageSubtitle}>
        Curated snack boxes, Build-a-Box, and individual snacks — contents on mystery boxes rotate weekly.
      </Text>

      <Pressable style={styles.dropsBanner} onPress={() => navigation.navigate("Drops")}>
        <Ionicons name="flash" size={18} color={colors.accentForeground} />
        <Text style={styles.dropsBannerText}>Live Drops — limited-time boxes</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.accentForeground} />
      </Pressable>

      <CategoryChips selected={category} onSelect={setCategory} />

      {hasError ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>Couldn't load the shop. Pull down to try again.</Text>
        </View>
      ) : isInitialLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <>
          {!category && boxesQuery.data && boxesQuery.data.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Boxes</Text>
              <FlatList
                data={boxesQuery.data}
                keyExtractor={(box) => box.id}
                numColumns={2}
                scrollEnabled={false}
                columnWrapperStyle={styles.row}
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
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Snacks</Text>
            {snacksQuery.data && snacksQuery.data.length > 0 ? (
              <FlatList
                data={snacksQuery.data}
                keyExtractor={(snack) => snack.id}
                numColumns={2}
                scrollEnabled={false}
                columnWrapperStyle={styles.row}
                renderItem={({ item: snack }) => (
                  <ProductCard
                    title={snack.name}
                    priceCents={snack.price_cents}
                    imageUrl={snack.imageUrl}
                    onPress={() => navigation.navigate("SnackDetail", { slug: snack.slug })}
                  />
                )}
              />
            ) : (
              <View style={styles.centerState}>
                <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
                <Text style={styles.emptyText}>No snacks match this filter.</Text>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
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
  pageHeading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  pageSubtitle: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  dropsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  dropsBannerText: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.accentForeground,
    flex: 1,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionHeading: {
    ...typography.sizes.lg,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.lg,
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
