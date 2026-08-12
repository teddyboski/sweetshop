import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/auth-context";
import { fetchRewards } from "../../lib/api/account";
import { colors, radii, spacing, typography } from "../../theme";
import type { AccountStackParamList } from "../../navigation/AccountStack";

type Nav = NativeStackNavigationProp<AccountStackParamList, "Account">;

/**
 * Milestone 14: replaces the Milestone 11 scratch screen (a button that
 * proved the bearer-token round trip worked) with the real account home
 * base - a rewards balance teaser and navigation into Orders,
 * Subscriptions, Rewards, and Referrals.
 */
export function AccountScreen() {
  const navigation = useNavigation<Nav>();
  const { session, signOut } = useAuth();
  const rewardsQuery = useQuery({ queryKey: ["account", "rewards"], queryFn: fetchRewards });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Account</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Rewards balance</Text>
        <Text style={styles.balanceValue}>
          {rewardsQuery.isPending ? "…" : `${(rewardsQuery.data?.balance ?? 0).toLocaleString()} pts`}
        </Text>
      </View>

      <View style={styles.menu}>
        <MenuRow icon="receipt-outline" label="Order History" onPress={() => navigation.navigate("Orders")} />
        <MenuRow icon="repeat-outline" label="Subscriptions" onPress={() => navigation.navigate("Subscriptions")} />
        <MenuRow icon="gift-outline" label="Rewards" onPress={() => navigation.navigate("Rewards")} />
        <MenuRow icon="people-outline" label="Refer Friends" onPress={() => navigation.navigate("Referrals")} />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.foreground} />
      <Text style={styles.menuRowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing["2xl"],
  },
  heading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  email: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginBottom: spacing.xl,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  balanceLabel: {
    ...typography.sizes.sm,
    color: colors.primaryForeground,
  },
  balanceValue: {
    ...typography.sizes.xl,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
    marginTop: spacing.xs / 2,
  },
  menu: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuRowLabel: {
    ...typography.sizes.base,
    color: colors.foreground,
    flex: 1,
  },
  signOutButton: {
    backgroundColor: colors.destructive,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing["3xl"],
  },
  signOutButtonText: {
    color: colors.destructiveForeground,
    fontFamily: typography.fontFamilyMedium,
    ...typography.sizes.base,
  },
});
