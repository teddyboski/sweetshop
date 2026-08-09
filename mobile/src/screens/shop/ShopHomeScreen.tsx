import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme";

/**
 * Placeholder - real catalog browsing ships in Milestone 12, which also
 * has to add new read-only /api/catalog/* routes first (the web app
 * currently queries Supabase directly from Server Components, not
 * through an API route mobile can call - see the mobile roadmap's
 * Milestone 12 "Ground Truth" note).
 */
export function ShopHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Shop</Text>
      <Text style={styles.body}>Boxes, snacks, and drops arrive in Milestone 12.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing["2xl"],
  },
  heading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.sizes.base,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
