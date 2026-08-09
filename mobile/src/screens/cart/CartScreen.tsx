import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme";

/** Placeholder - cart, Build-a-Box, and native checkout arrive in Milestone 13. */
export function CartScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Cart</Text>
      <Text style={styles.body}>Cart and checkout arrive in Milestone 13.</Text>
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
