import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { fetchMerchItemBySlug, type MerchVariant } from "../../lib/api/catalog";
import { addMerchToCart } from "../../lib/api/cart";
import { ProductImage } from "../../components/shared/ProductImage";
import { formatPriceCents } from "../../lib/utils/format";
import { useToast } from "../../lib/toast/toast-context";
import { colors, radii, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Route = RouteProp<ShopStackParamList, "MerchDetail">;

/** Mirrors SnackDetailScreen, with a size/color picker in place of a plain Add to Cart - see (shop)/shop/merch/[slug]/page.tsx's MerchVariantPicker, same selection logic. */
export function MerchDetailScreen() {
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: merchItem, isPending, isError } = useQuery({
    queryKey: ["catalog", "merch", params.slug],
    queryFn: () => fetchMerchItemBySlug(params.slug),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const variants = merchItem?.variants ?? [];
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

  const sizes = useMemo(() => Array.from(new Set(variants.map((v) => v.size).filter(Boolean))), [variants]);

  const addMutation = useMutation({
    mutationFn: (variantId: string) => addMerchToCart(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      showToast(`${merchItem?.name ?? "Item"} added to cart`);
    },
    onError: (err: Error) => showToast(err.message || "Couldn't add to cart", "error"),
  });

  if (isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError || !merchItem) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Item not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.imageWrap}>
        <ProductImage imageUrl={merchItem.imageUrl} size={280} radius="xl" />
      </View>

      <Text style={styles.title}>{merchItem.name}</Text>
      {merchItem.category && <Text style={styles.brand}>{merchItem.category}</Text>}
      {merchItem.description && <Text style={styles.description}>{merchItem.description}</Text>}

      {variants.length === 0 ? (
        <Text style={styles.outOfStock}>Currently out of stock - check back soon.</Text>
      ) : (
        <>
          {sizes.length > 0 && (
            <View style={styles.sizeRow}>
              {sizes.map((size) => {
                const match = variants.find((v) => v.size === size);
                const isSelected = (selected?.size ?? null) === size;
                return (
                  <Pressable
                    key={size}
                    onPress={() => match && setSelectedId(match.id)}
                    style={[styles.sizeChip, isSelected && styles.sizeChipSelected]}
                  >
                    <Text style={[styles.sizeChipText, isSelected && styles.sizeChipTextSelected]}>{size}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selected && <Text style={styles.price}>{formatPriceCents(selected.resolvedPriceCents)}</Text>}

          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            disabled={addMutation.isPending || !selected}
            onPress={() => selected && addMutation.mutate(selected.id)}
          >
            <Text style={styles.addButtonText}>
              {addMutation.isPending ? "Adding..." : addMutation.isSuccess ? "Added ✓" : "Add to Cart"}
            </Text>
          </Pressable>
          {addMutation.isError && <Text style={styles.errorText}>{addMutation.error.message}</Text>}
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
    textTransform: "capitalize",
  },
  description: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.md,
  },
  sizeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  sizeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  sizeChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  sizeChipText: {
    ...typography.sizes.sm,
    color: colors.foreground,
  },
  sizeChipTextSelected: {
    color: colors.primaryForeground,
  },
  price: {
    ...typography.sizes.xl,
    color: colors.foreground,
    marginTop: spacing.md,
  },
  outOfStock: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.lg,
  },
  addButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
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
