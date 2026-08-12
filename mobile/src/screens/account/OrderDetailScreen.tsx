import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { fetchOrderDetail } from "../../lib/api/account";
import { formatPriceCents, formatDate } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";
import type { AccountStackParamList } from "../../navigation/AccountStack";

type DetailRoute = RouteProp<AccountStackParamList, "OrderDetail">;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

interface ShippingAddressSnapshot {
  name?: string;
  address?: {
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
}

function isShippingAddressSnapshot(value: unknown): value is ShippingAddressSnapshot {
  return typeof value === "object" && value !== null;
}

/** Milestone 14: read-only, mirrors web's /account/orders/[id] page exactly. */
export function OrderDetailScreen() {
  const route = useRoute<DetailRoute>();
  const { id } = route.params;

  const orderQuery = useQuery({ queryKey: ["account", "order", id], queryFn: () => fetchOrderDetail(id) });

  if (orderQuery.isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.destructive} />
        <Text style={styles.errorText}>Couldn't load this order.</Text>
      </View>
    );
  }

  const order = orderQuery.data;
  const shipping = isShippingAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Order #{order.id.slice(0, 8)}</Text>
      <Text style={styles.meta}>Placed {formatDate(order.createdAt)}</Text>
      <Text style={styles.meta}>
        Status: <Text style={styles.metaEmphasis}>{STATUS_LABELS[order.status] ?? order.status}</Text>
      </Text>
      {order.trackingNumber && (
        <Text style={styles.meta}>
          Tracking: <Text style={styles.metaEmphasis}>{order.trackingNumber}</Text>
        </Text>
      )}

      <View style={styles.itemsCard}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemRowHeader}>
              <Text style={styles.itemName}>
                {item.quantity} x {item.name}
              </Text>
              <Text style={styles.itemPrice}>{formatPriceCents(item.unitPriceCents * item.quantity)}</Text>
            </View>
            {item.snackSelections && item.snackSelections.length > 0 && (
              <View style={styles.snackSelections}>
                {item.snackSelections.map((selection) => (
                  <Text key={selection.snackId} style={styles.snackSelectionText}>
                    {selection.quantity} x {selection.name}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatPriceCents(order.totalAmountCents)}</Text>
        </View>
      </View>

      {shipping?.address && (
        <View style={styles.shippingCard}>
          <Text style={styles.shippingHeading}>Shipping address</Text>
          <Text style={styles.shippingText}>{shipping.name}</Text>
          <Text style={styles.shippingText}>
            {shipping.address.line1}
            {shipping.address.line2 ? `, ${shipping.address.line2}` : ""}
          </Text>
          <Text style={styles.shippingText}>
            {shipping.address.city}, {shipping.address.state} {shipping.address.postal_code}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing["4xl"],
  },
  heading: {
    ...typography.sizes.xl,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  meta: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  metaEmphasis: {
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  itemsCard: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  itemRow: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemName: {
    ...typography.sizes.sm,
    color: colors.foreground,
    flex: 1,
    marginRight: spacing.sm,
  },
  itemPrice: {
    ...typography.sizes.sm,
    color: colors.foreground,
  },
  snackSelections: {
    marginTop: spacing.xs,
    paddingLeft: spacing.md,
    gap: spacing.xs / 2,
  },
  snackSelectionText: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  totalLabel: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  totalValue: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  shippingCard: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  shippingHeading: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  shippingText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorText: {
    ...typography.sizes.sm,
    color: colors.destructive,
    textAlign: "center",
  },
});
