import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { fetchSubscriptions, createSubscriptionPortalSession } from "../../lib/api/account";
import { formatDate } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
  past_due: "Past due",
};

/**
 * Milestone 14 (Product Decision #3): pause/cancel reuses the exact same
 * Stripe Customer Portal flow web's Milestone 7 already built, opened in an
 * in-app browser tab via expo-web-browser - directly mirrors
 * CheckoutScreen's own subscription-checkout fallback from Milestone 13,
 * rather than building a second, native subscription-management UI.
 */
export function SubscriptionsScreen() {
  const subscriptionsQuery = useQuery({ queryKey: ["account", "subscriptions"], queryFn: fetchSubscriptions });
  const [managingId, setManagingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleManage(id: string) {
    setError(null);
    setManagingId(id);
    try {
      const { url } = await createSubscriptionPortalSession();
      await WebBrowser.openBrowserAsync(url);
      // The Portal changes Stripe's state; customer.subscription.updated/
      // .deleted (already handled by the existing webhook) mirrors that back
      // into our subscriptions table - refetching here just picks up
      // whatever's landed by the time the user returns to the app.
      subscriptionsQuery.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open subscription management.");
    } finally {
      setManagingId(null);
    }
  }

  if (subscriptionsQuery.isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (subscriptionsQuery.isError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.destructive} />
        <Text style={styles.errorText}>Couldn't load your subscriptions.</Text>
      </View>
    );
  }

  const subscriptions = subscriptionsQuery.data ?? [];

  if (subscriptions.length === 0) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="repeat-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>No active subscriptions.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {subscriptions.map((sub) => (
        <View key={sub.id} style={styles.card}>
          <Text style={styles.boxTitle}>{sub.boxTitle}</Text>
          <Text style={styles.meta}>
            {STATUS_LABELS[sub.status] ?? sub.status}
            {sub.cadence ? ` · ${sub.cadence}` : ""}
          </Text>
          {sub.nextDeliveryAt && <Text style={styles.meta}>Next delivery {formatDate(sub.nextDeliveryAt)}</Text>}

          <Pressable
            style={styles.manageButton}
            disabled={managingId === sub.id}
            onPress={() => handleManage(sub.id)}
          >
            {managingId === sub.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.manageButtonText}>Manage Subscription</Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
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
  },
  boxTitle: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  meta: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs / 2,
  },
  manageButton: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  manageButtonText: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary,
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
