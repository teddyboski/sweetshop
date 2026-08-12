import { useCallback } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchOrders, type OrderSummary } from "../../lib/api/account";
import { formatPriceCents, formatDate } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";
import type { AccountStackParamList } from "../../navigation/AccountStack";

type Nav = NativeStackNavigationProp<AccountStackParamList, "Orders">;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Milestone 14: read-only, mirrors web's /account/orders page exactly. */
export function OrdersScreen() {
  const navigation = useNavigation<Nav>();
  const ordersQuery = useQuery({ queryKey: ["account", "orders"], queryFn: fetchOrders });

  const onRefresh = useCallback(() => {
    ordersQuery.refetch();
  }, [ordersQuery]);

  if (ordersQuery.isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (ordersQuery.isError) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.destructive} />
        <Text style={styles.errorText}>Couldn't load your orders. Pull down to try again.</Text>
      </View>
    );
  }

  const orders = ordersQuery.data ?? [];

  if (orders.length === 0) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="receipt-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>No orders yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(order) => order.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={ordersQuery.isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      renderItem={({ item: order }) => (
        <Pressable style={styles.row} onPress={() => navigation.navigate("OrderDetail", { id: order.id })}>
          <View style={styles.rowMain}>
            <Text style={styles.orderNumber}>Order #{order.id.slice(0, 8)}</Text>
            <Text style={styles.orderMeta}>
              {formatDate(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={styles.rowSide}>
            <Text style={styles.orderTotal}>{formatPriceCents(order.totalAmountCents)}</Text>
            <Text style={styles.orderStatus}>{STATUS_LABELS[order.status] ?? order.status}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMain: {
    flex: 1,
  },
  orderNumber: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  orderMeta: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs / 2,
  },
  rowSide: {
    alignItems: "flex-end",
    marginRight: spacing.sm,
  },
  orderTotal: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  orderStatus: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs / 2,
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
