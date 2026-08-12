import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { fetchReferrals, type ReferralStatus } from "../../lib/api/account";
import { formatDate } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  credited: "Credited",
};

/**
 * Milestone 14: mirrors web's /account/referrals page, but uses React
 * Native's built-in Share API for the native share sheet instead of web's
 * copy-to-clipboard button (Task 6 of the plan doc - no new dependency,
 * expo-sharing wasn't needed for a plain text share). Referral capture only
 * exists on the web /signup page (Milestone 9) - the link this shares
 * always points at the website, same as the API route that builds it.
 */
export function ReferralsScreen() {
  const referralsQuery = useQuery({ queryKey: ["account", "referrals"], queryFn: fetchReferrals });

  async function handleShare(referralLink: string) {
    try {
      await Share.share({
        message: `Come check out Sweet Shop - sign up with my link and we both get rewards points: ${referralLink}`,
      });
    } catch {
      // User cancelled the share sheet or the OS share call failed silently -
      // nothing actionable to show here, matches the share sheet's own
      // native cancel behavior (no error banner on a simple dismiss).
    }
  }

  if (referralsQuery.isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (referralsQuery.isError || !referralsQuery.data) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.destructive} />
        <Text style={styles.errorText}>Couldn't load your referral info.</Text>
      </View>
    );
  }

  const { referralLink, referrals } = referralsQuery.data;

  return (
    <FlatList
      data={referrals}
      keyExtractor={(referral) => referral.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.linkCard}>
          <Text style={styles.linkLabel}>Your referral link</Text>
          <Text style={styles.linkValue} numberOfLines={1}>
            {referralLink}
          </Text>
          <Pressable style={styles.shareButton} onPress={() => handleShare(referralLink)}>
            <Ionicons name="share-outline" size={16} color={colors.primaryForeground} />
            <Text style={styles.shareButtonText}>Share</Text>
          </Pressable>
          <Text style={styles.sectionHeading}>Friends you've referred</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centerState}>
          <Ionicons name="people-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>No referrals yet - share your link to get started.</Text>
        </View>
      }
      renderItem={({ item }: { item: ReferralStatus }) => (
        <View style={styles.row}>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
          <Text style={[styles.status, item.status === "credited" && styles.statusCredited]}>
            {STATUS_LABELS[item.status] ?? item.status}
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
  linkCard: {
    marginBottom: spacing.md,
  },
  linkLabel: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
  },
  linkValue: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginTop: spacing.xs / 2,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  shareButtonText: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
  },
  sectionHeading: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xl,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  date: {
    ...typography.sizes.sm,
    color: colors.foreground,
  },
  status: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
  },
  statusCredited: {
    color: colors.primary,
    fontFamily: typography.fontFamilyMedium,
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
    textAlign: "center",
  },
  errorText: {
    ...typography.sizes.sm,
    color: colors.destructive,
    textAlign: "center",
  },
});
