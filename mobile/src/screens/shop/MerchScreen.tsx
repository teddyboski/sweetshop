import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchMerchItems } from "../../lib/api/catalog";
import { ProductCard } from "../../components/shared/ProductCard";
import { SkeletonCard } from "../../components/shared/SkeletonCard";
import { colors, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Nav = NativeStackNavigationProp<ShopStackParamList, "Merch">;

/** Milestone 16: mirrors ShopHomeScreen's Snacks grid, one product family per screen (Milestone 18 gives this a home-page tile of its own). */
export function MerchScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isPending, isError } = useQuery({ queryKey: ["catalog", "merch"], queryFn: () => fetchMerchItems() });

  if (isPending) {
    return (
      <View style={styles.grid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Couldn't load merchandise.</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="shirt-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Nothing here yet - check back soon.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <ProductCard
          title={item.name}
          priceCents={item.price_cents}
          imageUrl={item.imageUrl}
          onPress={() => navigation.navigate("MerchDetail", { slug: item.slug })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing["4xl"],
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    padding: spacing.lg,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing["2xl"],
  },
  emptyText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
