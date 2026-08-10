import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { fetchSnackBySlug } from "../../lib/api/catalog";
import { addSnackToCart } from "../../lib/api/cart";
import { ProductImage } from "../../components/shared/ProductImage";
import { formatPriceCents } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Route = RouteProp<ShopStackParamList, "SnackDetail">;

/** Mirrors (shop)/shop/snack/[slug]/page.tsx, now with a working Add to Cart (Milestone 13). */
export function SnackDetailScreen() {
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();
  const { data: snack, isPending, isError } = useQuery({
    queryKey: ["catalog", "snack", params.slug],
    queryFn: () => fetchSnackBySlug(params.slug),
  });

  const addMutation = useMutation({
    mutationFn: (snackId: string) => addSnackToCart(snackId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });

  if (isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError || !snack) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Snack not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.imageWrap}>
        <ProductImage imageUrl={snack.imageUrl} size={280} radius="xl" />
      </View>

      <Text style={styles.title}>{snack.name}</Text>
      {snack.brand && <Text style={styles.brand}>{snack.brand}</Text>}
      <Text style={styles.price}>{formatPriceCents(snack.price_cents ?? 0)}</Text>

      {snack.category && <Text style={styles.category}>Category: {snack.category}</Text>}

      {snack.tags && snack.tags.length > 0 && (
        <View style={styles.tagRow}>
          {snack.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        style={styles.addButton}
        disabled={addMutation.isPending}
        onPress={() => addMutation.mutate(snack.id)}
      >
        <Text style={styles.addButtonText}>
          {addMutation.isPending ? "Adding..." : addMutation.isSuccess ? "Added ✓" : "Add to Cart"}
        </Text>
      </Pressable>
      {addMutation.isError && <Text style={styles.errorText}>{addMutation.error.message}</Text>}
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
  imageWrap: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  brand: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  price: {
    ...typography.sizes.xl,
    color: colors.foreground,
    marginTop: spacing.sm,
  },
  category: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    textTransform: "capitalize",
    marginTop: spacing.md,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    backgroundColor: colors.muted,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  tagText: {
    ...typography.sizes.xs,
    color: colors.foreground,
    textTransform: "capitalize",
  },
  addButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addButtonText: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
  },
  errorText: {
    ...typography.sizes.sm,
    color: colors.destructive,
    marginTop: spacing.sm,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  emptyText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
  },
});
