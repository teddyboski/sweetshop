import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchBoxBySlug } from "../../lib/api/catalog";
import { addBoxToCart } from "../../lib/api/cart";
import { ProductImage } from "../../components/shared/ProductImage";
import { formatPriceCents } from "../../lib/utils/format";
import { useToast } from "../../lib/toast/toast-context";
import { colors, radii, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Route = RouteProp<ShopStackParamList, "BoxDetail">;
type Nav = NativeStackNavigationProp<ShopStackParamList, "BoxDetail">;

/**
 * Mirrors (shop)/shop/box/[slug]/page.tsx's content, now with a working
 * Add to Cart (Milestone 13) instead of the Milestone 12 info-only
 * placeholder. Build-a-Box boxes route to the picker screen instead of
 * adding directly, same split the web page makes.
 */
export function BoxDetailScreen() {
  const { params } = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: box, isPending, isError } = useQuery({
    queryKey: ["catalog", "box", params.slug],
    queryFn: () => fetchBoxBySlug(params.slug),
  });

  const addMutation = useMutation({
    mutationFn: (slug: string) => addBoxToCart(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      showToast(`${box?.title ?? "Box"} added to cart`);
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

  if (isError || !box) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Box not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.imageWrap}>
        <ProductImage imageUrl={box.imageUrl} size={280} radius="xl" />
      </View>

      <Text style={styles.title}>{box.title}</Text>
      <Text style={styles.price}>
        {formatPriceCents(box.price_cents)}
        {box.is_subscription && <Text style={styles.cadence}> / {box.cadence}</Text>}
      </Text>

      {box.description && <Text style={styles.description}>{box.description}</Text>}

      {box.box_type === "build_a_box" ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>Pick exactly {box.slot_count} snacks to build this box.</Text>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            onPress={() => navigation.navigate("BuildABox")}
          >
            <Text style={styles.addButtonText}>Build this box</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          disabled={addMutation.isPending}
          onPress={() => addMutation.mutate(box.slug)}
        >
          <Text style={styles.addButtonText}>
            {addMutation.isPending ? "Adding..." : addMutation.isSuccess ? "Added ✓" : "Add to Cart"}
          </Text>
        </Pressable>
      )}

      {addMutation.isError && <Text style={styles.errorText}>{addMutation.error.message}</Text>}

      {box.box_type !== "build_a_box" && box.items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>What's typically inside</Text>
          {box.items.map((item, i) => (
            <Text key={i} style={styles.itemLine}>
              • {item.snacks?.name}
            </Text>
          ))}
          <Text style={styles.disclaimer}>
            Contents rotate weekly and may vary — this is a representative example, not a guaranteed list.
          </Text>
        </View>
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
  price: {
    ...typography.sizes.xl,
    color: colors.foreground,
    marginTop: spacing.xs,
  },
  cadence: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
  },
  description: {
    ...typography.sizes.base,
    color: colors.mutedForeground,
    marginTop: spacing.md,
  },
  noteBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.secondary,
  },
  noteText: {
    ...typography.sizes.sm,
    color: colors.secondaryForeground,
    marginBottom: spacing.md,
  },
  addButton: {
    marginTop: spacing.lg,
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
  section: {
    marginTop: spacing.xl,
  },
  sectionHeading: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  itemLine: {
    ...typography.sizes.base,
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  disclaimer: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
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
