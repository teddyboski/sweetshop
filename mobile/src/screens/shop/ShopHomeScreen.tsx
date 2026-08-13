import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { fetchSnacks } from "../../lib/api/catalog";
import { ProductCard } from "../../components/shared/ProductCard";
import { colors, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";
import type { RootTabParamList } from "../../navigation/RootTabs";
import { useAuth } from "../../lib/auth/auth-context";

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<ShopStackParamList, "ShopHome">,
  BottomTabNavigationProp<RootTabParamList>
>;

type ShopTile = { kind: "shop"; screen: "SnackBoxes" | "CandyBoxes" | "MysteryBox" | "BuildABox" };
type AccountTile = { kind: "account"; screen: "Rewards" | "Referrals" };
type Tile = (ShopTile | AccountTile) & {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
};

/**
 * Milestone 18: the same storefront destinations as the web homepage's
 * SHOP_CATEGORY_LINKS, reached the same way - choosing a curated/mystery
 * box category goes to its own listing screen, Build-a-Box goes straight
 * into the build flow (already true - that screen has never been a
 * listing), Rewards/Referrals go to their own existing screens.
 * Rewards/Referrals live on AccountStack, a different tab, hence the
 * cross-tab navigation below.
 *
 * NOTE: Merchandise (Milestone 16) isn't merged to main yet as of this
 * writing, so its ShopStack screens don't exist on this branch - add a
 * Merch tile here once that lands and this branch picks it up, matching
 * the web tile grid's Merchandise entry.
 */
const TILES: Tile[] = [
  { kind: "shop", screen: "SnackBoxes", icon: "cube-outline", label: "Snack Boxes", description: "Hand-packed & ready to ship" },
  { kind: "shop", screen: "CandyBoxes", icon: "gift-outline", label: "Candy Boxes", description: "A curated candy mix" },
  { kind: "shop", screen: "MysteryBox", icon: "help-circle-outline", label: "Mystery Box", description: "Surprise, rotating contents" },
  { kind: "shop", screen: "BuildABox", icon: "construct-outline", label: "Build-a-Box", description: "Pick your own snacks" },
  { kind: "account", screen: "Rewards", icon: "star-outline", label: "Rewards", description: "Track points & perks" },
  { kind: "account", screen: "Referrals", icon: "people-outline", label: "Referrals", description: "Give and get a discount" },
];

export function ShopHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();

  // House Snacks stays as a featured shelf below the tile menu (Ted's
  // in-house made items are a differentiator worth surfacing), even
  // though it's not one of the dedicated-page destinations above.
  const houseSnacksQuery = useQuery({
    queryKey: ["catalog", "snacks", "house_snacks"],
    queryFn: () => fetchSnacks({ category: "house_snacks" }),
  });

  const onRefresh = useCallback(() => {
    houseSnacksQuery.refetch();
  }, [houseSnacksQuery]);

  function handleTilePress(tile: Tile) {
    if (tile.kind === "account") {
      // AccountStack only ever registers a "Login" screen while signed
      // out (see that stack's own comment) - target it directly rather
      // than the real screen name, or React Navigation would warn about
      // navigating to an unregistered screen.
      navigation.navigate("AccountTab", { screen: session ? tile.screen : "Login" });
      return;
    }
    navigation.navigate(tile.screen);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={houseSnacksQuery.isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={styles.pageHeading}>Shop</Text>
      <Text style={styles.pageSubtitle}>Pick your box — mystery boxes rotate weekly.</Text>

      <Pressable style={styles.dropsBanner} onPress={() => navigation.navigate("Drops")}>
        <Ionicons name="flash" size={18} color={colors.accentForeground} />
        <Text style={styles.dropsBannerText}>Live Drops — limited-time boxes</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.accentForeground} />
      </Pressable>

      <View style={styles.grid}>
        {TILES.map((tile) => (
          <Pressable key={tile.label} style={styles.tile} onPress={() => handleTilePress(tile)}>
            <Ionicons name={tile.icon} size={26} color={colors.primary} />
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileDescription}>{tile.description}</Text>
          </Pressable>
        ))}
      </View>

      {houseSnacksQuery.data && houseSnacksQuery.data.length > 0 && (
        <View style={styles.section}>
          <View style={styles.houseHeadingRow}>
            <Ionicons name="home" size={16} color={colors.primary} />
            <Text style={styles.sectionHeading}>House Snacks</Text>
          </View>
          <Text style={styles.houseSubtitle}>Made in-house by us — trail mix, dipped cookies, and more.</Text>
          <FlatList
            data={houseSnacksQuery.data}
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
    marginBottom: spacing.lg,
  },
  dropsBannerText: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.accentForeground,
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  tile: {
    width: "47%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tileLabel: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  tileDescription: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
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
  houseHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  houseSubtitle: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
});
