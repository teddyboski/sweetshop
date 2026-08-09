import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { fetchBoxBySlug } from "../../lib/api/catalog";
import { ProductImage } from "../../components/shared/ProductImage";
import { formatPriceCents } from "../../lib/utils/format";
import { colors, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Route = RouteProp<ShopStackParamList, "BoxDetail">;

/**
 * Mirrors (shop)/shop/box/[slug]/page.tsx's content exactly. No Add to
 * Cart / Build this box action yet - Milestone 12 is catalog browsing
 * only, cart mutations are Milestone 13's job (see the mobile roadmap's
 * dependency chain). This screen answers "what is this box", not
 * "how do I buy it" yet.
 */
export function BoxDetailScreen() {
  const { params } = useRoute<Route>();
  const { data: box, isPending, isError } = useQuery({
    queryKey: ["catalog", "box", params.slug],
    queryFn: () => fetchBoxBySlug(params.slug),
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
        </View>
      ) : (
        box.items.length > 0 && (
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
        )
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
