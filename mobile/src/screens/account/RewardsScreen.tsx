import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { fetchRewards, type RewardsLedgerEntry } from "../../lib/api/account";
import { formatDate } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";

const REASON_LABELS: Record<string, string> = {
  order_placed: "Order placed",
  subscription_renewal: "Subscription renewal",
  redemption: "Redeemed at checkout",
  referral_referrer_credit: "Referral bonus",
  referral_referred_credit: "Referral bonus",
  adjustment: "Adjustment",
};

/** Milestone 14: read-only, mirrors web's /account/rewards page exactly. */
export function RewardsScreen() {
  const rewardsQuery = useQuery({ queryKey: ["account", "rewards"], queryFn: fetchRewards });

  if (rewardsQuery.isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (rewardsQuery.isError || !rewardsQuery.data) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.destructive} />
        <Text style={styles.errorText}>Couldn't load your rewards.</Text>
      </View>
    );
  }

  const { balance, ledger } = rewardsQuery.data;

  return (
    <FlatList
      data={ledger}
      keyExtractor={(entry) => entry.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your balance</Text>
          <Text style={styles.balanceValue}>{balance.toLocaleString()} pts</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centerState}>
          <Ionicons name="gift-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>No rewards activity yet.</Text>
        </View>
      }
      renderItem={({ item }: { item: RewardsLedgerEntry }) => (
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.reason}>{REASON_LABELS[item.reason] ?? item.reason}</Text>
            <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={[styles.delta, item.deltaPoints < 0 && styles.deltaNegative]}>
            {item.deltaPoints > 0 ? "+" : ""}
            {item.deltaPoints.toLocaleString()}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    ...typography.sizes.sm,
    color: colors.primaryForeground,
  },
  balanceValue: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
    marginTop: spacing.xs / 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
  },
  reason: {
    ...typography.sizes.sm,
    color: colors.foreground,
  },
  date: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs / 2,
  },
  delta: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary,
  },
  deltaNegative: {
    color: colors.destructive,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
  },
  errorText: {
    ...typography.sizes.sm,
    color: colors.destructive,
    textAlign: "center",
  },
});
