import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../../theme";
import type { ShopStackParamList } from "../../navigation/ShopStack";
import type { RootTabParamList } from "../../navigation/RootTabs";
import { useAuth } from "../../lib/auth/auth-context";

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<ShopStackParamList, "ShopHome">,
  BottomTabNavigationProp<RootTabParamList>
>;

type ShopTile = {
  kind: "shop";
  screen: "SnackBoxes" | "CandyBoxes" | "MysteryBox" | "BuildABox" | "Snacks" | "HouseSnacks" | "Merch";
};
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
 * listing), Merchandise (Milestone 16) goes to its own listing screen,
 * Rewards/Referrals go to their own existing screens. Rewards/Referrals
 * live on AccountStack, a different tab, hence the cross-tab navigation
 * below.
 *
 * Milestone 19 adds Snacks and House Snacks as their own tiles/screens.
 * House Snacks used to be a special-cased shelf living directly on this
 * screen (and only on mobile - web never had an equivalent) - Ted flagged
 * that inconsistency, so it's now a full destination like everything
 * else, and the shelf below the grid is gone.
 */
const TILES: Tile[] = [
  { kind: "shop", screen: "SnackBoxes", icon: "cube-outline", label: "Snack Boxes", description: "Hand-packed & ready to ship" },
  { kind: "shop", screen: "CandyBoxes", icon: "gift-outline", label: "Candy Boxes", description: "A curated candy mix" },
  { kind: "shop", screen: "MysteryBox", icon: "help-circle-outline", label: "Mystery Box", description: "Surprise, rotating contents" },
  { kind: "shop", screen: "BuildABox", icon: "construct-outline", label: "Build-a-Box", description: "Pick your own snacks" },
  { kind: "shop", screen: "Snacks", icon: "fast-food-outline", label: "Snacks", description: "Chips, candy, cookies & cakes" },
  { kind: "shop", screen: "HouseSnacks", icon: "home-outline", label: "House Snacks", description: "Made in-house by us" },
  { kind: "shop", screen: "Merch", icon: "shirt-outline", label: "Merchandise", description: "Apparel & goods, made in-house" },
  { kind: "account", screen: "Rewards", icon: "star-outline", label: "Rewards", description: "Track points & perks" },
  { kind: "account", screen: "Referrals", icon: "people-outline", label: "Referrals", description: "Give and get a discount" },
];

export function ShopHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
});
