import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme";

/** Placeholder - full-text catalog search arrives in Milestone 12. */
export function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Search</Text>
      <Text style={styles.body}>Search arrives in Milestone 12.</Text>
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
