import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchActiveDrops, type CatalogDrop } from "../../lib/api/catalog";
import { ProductImage } from "../../components/shared/ProductImage";
import { Countdown } from "../../components/shared/Countdown";
import { formatPriceCents } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";

type Nav = NativeStackNavigationProp<ShopStackParamList, "Drops">;

/**
 * Mirrors (shop)/shop/drops/[id]/page.tsx's getDropWindowStatus logic
 * exactly (isSoldOut / isBeforeStart / isAfterEnd / canBuy) - see that
 * function's web-side original for the source of truth this is copied
 * from. No web listing page exists to mirror for the screen itself; see
 * getActiveDrops()'s comment in queries/catalog.ts for why.
 */
function getDropWindowStatus(drop: CatalogDrop) {
  const now = Date.now();
  const isSoldOut = drop.units_sold >= drop.quantity_limit;
  const isBeforeStart = now < new Date(drop.starts_at).getTime();
  const isAfterEnd = now > new Date(drop.ends_at).getTime();
  return { isSoldOut, isBeforeStart, isAfterEnd, canBuy: !isSoldOut && !isBeforeStart && !isAfterEnd };
}

export function DropsScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isPending, isError } = useQuery({ queryKey: ["catalog", "drops"], queryFn: fetchActiveDrops });

  if (isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Couldn't load drops.</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="flash-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>No live drops right now — check back soon.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(drop) => drop.id}
      contentContainerStyle={styles.list}
      renderItem={({ item: drop }) => {
        const { isSoldOut, isBeforeStart, isAfterEnd, canBuy } = getDropWindowStatus(drop);
        return (
          <View style={styles.card}>
            <View style={styles.row}>
              <ProductImage imageUrl={drop.box.imageUrl} size={80} />
              <View style={styles.info}>
                <Text style={styles.badge}>LIMITED DROP</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {drop.box.title}
                </Text>
                <Text style={styles.price}>{formatPriceCents(drop.box.price_cents)}</Text>
              </View>
            </View>

            <View style={styles.countdownRow}>
              {isAfterEnd ? (
                <Countdown target={drop.ends_at} endedLabel="This drop has ended" />
              ) : isBeforeStart ? (
                <Countdown target={drop.starts_at} endedLabel="Starting now" />
              ) : (
                <Countdown target={drop.ends_at} endedLabel="This drop has ended" />
              )}
            </View>

            <Text style={styles.claimed}>
              {drop.units_sold} of {drop.quantity_limit} claimed
            </Text>

            {!canBuy && (
              <Text style={styles.statusNote}>
                {isSoldOut ? "Sold out" : isBeforeStart ? "Not yet available" : "This drop has ended"}
              </Text>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  info: {
    flex: 1,
    justifyContent: "center",
  },
  badge: {
    ...typography.sizes.xs,
    fontFamily: typography.fontFamilyMedium,
    color: colors.accent,
  },
  title: {
    ...typography.sizes.lg,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginTop: spacing.xs / 2,
  },
  price: {
    ...typography.sizes.base,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  countdownRow: {
    marginTop: spacing.md,
  },
  claimed: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
  },
  statusNote: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
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
    textAlign: "center",
    paddingHorizontal: spacing["2xl"],
  },
});
