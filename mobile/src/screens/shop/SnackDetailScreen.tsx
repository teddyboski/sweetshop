import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, Image as RNImage } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { fetchSnackBySlug } from "../../lib/api/catalog";
import { addSnackToCart } from "../../lib/api/cart";
import { formatPriceCents } from "../../lib/utils/format";
import { useToast } from "../../lib/toast/toast-context";
import { colors, radii, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Route = RouteProp<ShopStackParamList, "SnackDetail">;

export function SnackDetailScreen() {
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: snack, isPending, isError } = useQuery({
    queryKey: ["catalog", "snack", params.slug],
    queryFn: () => fetchSnackBySlug(params.slug),
  });

  const hasVariants = (snack?.variants?.length ?? 0) > 0;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const selectedVariant = snack?.variants?.find((v) => v.id === selectedVariantId) ?? null;
  const displayPrice = selectedVariant ? selectedVariant.price_cents : snack?.price_cents ?? 0;

  const addMutation = useMutation({
    mutationFn: () => {
      if (!snack) throw new Error("Snack not loaded");
      return addSnackToCart(snack.id, 1, selectedVariant?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      showToast(`${snack?.name ?? "Snack"} added to cart`);
    },
    onError: (err: Error) => showToast(err.message || "Couldnt add to cart", "error"),
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

  const canAddToCart = !hasVariants || selectedVariantId !== null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {snack.imageUrls && snack.imageUrls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageStrip} contentContainerStyle={styles.imageStripContent}>
          {snack.imageUrls.map((url, i) => (
            <RNImage key={i} source={{ uri: url }} style={styles.imageItem} resizeMode="cover" />
          ))}
        </ScrollView>
      ) : snack.imageUrl ? (
        <View style={styles.imageWrap}>
          <RNImage source={{ uri: snack.imageUrl }} style={styles.imageSingle} resizeMode="cover" />
        </View>
      ) : null}

      <Text style={styles.title}>{snack.name}</Text>
      {snack.brand && <Text style={styles.brand}>{snack.brand}</Text>}
      <Text style={styles.price}>{formatPriceCents(displayPrice)}</Text>

      {hasVariants && (
        <View style={styles.variantSection}>
          <Text style={styles.variantLabel}>Size</Text>
          <View style={styles.variantRow}>
            {snack.variants.map((variant) => {
              const selected = selectedVariantId === variant.id;
              return (
                <Pressable
                  key={variant.id}
                  style={[styles.variantBtn, selected && styles.variantBtnSelected]}
                  onPress={() => setSelectedVariantId(variant.id)}
                >
                  <Text style={[styles.variantBtnText, selected && styles.variantBtnTextSelected]}>
                    {variant.size}
                  </Text>
                  <Text style={[styles.variantPrice, selected && styles.variantBtnTextSelected]}>
                    {formatPriceCents(variant.price_cents)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

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
        style={({ pressed }) => [styles.addButton, (!canAddToCart || addMutation.isPending) && styles.addButtonDisabled, pressed && canAddToCart && styles.addButtonPressed]}
        disabled={!canAddToCart || addMutation.isPending}
        onPress={() => addMutation.mutate()}
      >
        <Text style={styles.addButtonText}>
          {addMutation.isPending ? "Adding..." : hasVariants && !selectedVariantId ? "Select a size" : addMutation.isSuccess ? "Added!" : "Add to Cart"}
        </Text>
      </Pressable>
      {addMutation.isError && <Text style={styles.errorText}>{addMutation.error.message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing["4xl"] },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.background },
  emptyText: { ...typography.sizes.sm, color: colors.mutedForeground },
  imageStrip: { marginBottom: spacing[4] },
  imageStripContent: { gap: spacing[2], paddingHorizontal: spacing[4] },
  imageItem: { width: 280, height: 280, borderRadius: 16 },
  imageSingle: { width: 280, height: 280, borderRadius: 16 },
  imageWrap: { alignItems: "center", marginBottom: spacing.lg },
  title: { ...typography.sizes["2xl"], fontFamily: typography.fontFamilyMedium, color: colors.foreground },
  brand: { ...typography.sizes.sm, color: colors.mutedForeground, marginTop: spacing.xs },
  price: { ...typography.sizes.xl, color: colors.foreground, marginTop: spacing.sm },
  variantSection: { marginTop: spacing.md },
  variantLabel: { ...typography.sizes.sm, fontFamily: typography.fontFamilyMedium, color: colors.foreground, marginBottom: spacing.xs },
  variantRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  variantBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: "center" },
  variantBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primary + "0D" },
  variantBtnText: { ...typography.sizes.sm, color: colors.foreground },
  variantBtnTextSelected: { color: colors.primary, fontFamily: typography.fontFamilyMedium },
  variantPrice: { ...typography.sizes.xs, color: colors.mutedForeground, marginTop: 2 },
  category: { ...typography.sizes.sm, color: colors.mutedForeground, textTransform: "capitalize", marginTop: spacing.md },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  tag: { backgroundColor: colors.muted, borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 },
  tagText: { ...typography.sizes.xs, color: colors.foreground, textTransform: "capitalize" },
  addButton: { marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: spacing.md, alignItems: "center" },
  addButtonDisabled: { opacity: 0.5 },
  addButtonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  addButtonText: { ...typography.sizes.base, fontFamily: typography.fontFamilyMedium, color: colors.primaryForeground },
  errorText: { ...typography.sizes.sm, color: colors.destructive, marginTop: spacing.sm },
  imageStripContent2: { gap: spacing[2] },
});