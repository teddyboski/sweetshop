import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { fetchCart, updateCartItemQuantity, removeCartItem, type CartLine } from "../../lib/api/cart";
import { formatPriceCents } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";
import type { CartStackParamList } from "../../navigation/CartStack";

type Nav = NativeStackNavigationProp<CartStackParamList, "Cart">;

const SNACK_ONLY_FREE_SHIPPING_THRESHOLD_CENTS = 2500;

/**
 * Mirrors (shop)/shop/cart/page.tsx's contents and shipping-nudge copy
 * exactly, reading through the new GET /api/cart route (Milestone 13) -
 * same getCartContents() the web page calls, so totals match by
 * construction. Checkout button is a placeholder here - native Payment
 * Sheet integration is scoped separately (see the milestone plan's own
 * note on reconciling it with the web app's hosted Checkout Session).
 */
export function CartScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["cart"], queryFn: fetchCart });

  // Cart contents can change from other screens (Add to Cart on a detail
  // screen) - refetch whenever this tab regains focus rather than only on
  // mount, so returning here always shows what was just added.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => updateCartItemQuantity(id, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeCartItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });

  if (isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>Couldn't load your cart.</Text>
      </View>
    );
  }

  if (data.lines.length === 0) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cart-outline" size={40} color={colors.mutedForeground} />
        <Text style={styles.emptyHeading}>Your cart is empty</Text>
        <Text style={styles.emptyText}>Add a box or a few snacks to get started.</Text>
      </View>
    );
  }

  const { total } = data;
  const remainingForFreeShipping = SNACK_ONLY_FREE_SHIPPING_THRESHOLD_CENTS - total.subtotalCents;

  return (
    <View style={styles.container}>
      <FlatList
        data={data.lines}
        keyExtractor={(line) => line.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: line }) => (
          <CartLineRow
            line={line}
            onIncrement={() => updateMutation.mutate({ id: line.id, quantity: line.quantity + 1 })}
            onDecrement={() =>
              line.quantity > 1
                ? updateMutation.mutate({ id: line.id, quantity: line.quantity - 1 })
                : removeMutation.mutate(line.id)
            }
            onRemove={() => removeMutation.mutate(line.id)}
          />
        )}
        ListFooterComponent={
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatPriceCents(total.subtotalCents)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Shipping</Text>
              <Text style={styles.summaryValue}>
                {total.shippingCents === 0 ? "Free" : formatPriceCents(total.shippingCents)}
              </Text>
            </View>
            {!total.hasBox && total.shippingCents > 0 && (
              <Text style={styles.nudge}>
                Add {formatPriceCents(remainingForFreeShipping)} more, or add any box, for free shipping.
              </Text>
            )}
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatPriceCents(total.totalCents)}</Text>
            </View>
          </View>
        }
      />

      <View style={styles.checkoutBar}>
        <Pressable style={styles.checkoutButtonActive} onPress={() => navigation.navigate("Checkout")}>
          <Text style={styles.checkoutButtonActiveText}>Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CartLineRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: CartLine;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {line.name}
        </Text>
        {line.isBuildABox && line.snackSelections && (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {line.snackSelections.map((s) => `${s.name} x${s.quantity}`).join(", ")}
          </Text>
        )}
        <Text style={styles.rowPrice}>{formatPriceCents(line.unitPriceCents)}</Text>
      </View>

      {line.isBuildABox ? (
        <Pressable onPress={onRemove} style={styles.removeButton}>
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
        </Pressable>
      ) : (
        <View style={styles.stepper}>
          <Pressable onPress={onDecrement} style={styles.stepperButton}>
            <Ionicons name="remove" size={16} color={colors.foreground} />
          </Pressable>
          <Text style={styles.stepperValue}>{line.quantity}</Text>
          <Pressable onPress={onIncrement} style={styles.stepperButton}>
            <Ionicons name="add" size={16} color={colors.foreground} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  rowSubtitle: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs / 2,
  },
  rowPrice: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    ...typography.sizes.sm,
    color: colors.foreground,
    minWidth: 20,
    textAlign: "center",
  },
  removeButton: {
    padding: spacing.sm,
  },
  summary: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: {
    ...typography.sizes.sm,
    color: colors.foreground,
  },
  summaryValue: {
    ...typography.sizes.sm,
    color: colors.foreground,
  },
  nudge: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
  },
  totalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  checkoutBar: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  checkoutButtonActive: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  checkoutButtonActiveText: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing["2xl"],
  },
  emptyHeading: {
    ...typography.sizes.lg,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  emptyText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
