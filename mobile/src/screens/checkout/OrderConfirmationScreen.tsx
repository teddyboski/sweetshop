import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOrderConfirmation } from "../../lib/api/orders";
import { formatPriceCents } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";
import type { CartStackParamList } from "../../navigation/CartStack";

type Nav = NativeStackNavigationProp<CartStackParamList, "OrderConfirmation">;
type ConfirmationRoute = RouteProp<CartStackParamList, "OrderConfirmation">;

/**
 * Milestone 13: lands here immediately after presentPaymentSheet() resolves
 * successfully (see CheckoutScreen.handleNativeCheckout) - the roadmap's
 * "Order confirmation screen reading the same webhook-confirmed orders row
 * the web confirmation page reads" completion criterion.
 *
 * The order row itself is created by the payment_intent.succeeded webhook
 * asynchronously (see that handler's header comment in
 * webhooks/stripe/route.ts), so this screen polls
 * /api/orders/by-payment-intent rather than assuming the order exists on
 * first render - same "webhook is the source of truth, the UI just catches
 * up" pattern the web checkout success page documents for itself.
 * refetchInterval stops polling once the endpoint reports "ready" (and is
 * capped via dataUpdateCount so a slow/failed webhook doesn't poll forever).
 */
export function OrderConfirmationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ConfirmationRoute>();
  const queryClient = useQueryClient();
  const { paymentIntentId } = route.params;

  const { data, isPending } = useQuery({
    queryKey: ["order-confirmation", paymentIntentId],
    queryFn: () => fetchOrderConfirmation(paymentIntentId),
    refetchInterval: (query) => {
      if (query.state.data?.status === "ready") return false;
      if (query.state.dataUpdateCount >= 12) return false; // ~1 minute at 5s intervals
      return 5000;
    },
  });

  useEffect(() => {
    if (data?.status === "ready") {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    }
  }, [data?.status, queryClient]);

  const order = data?.order ?? null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Thanks for your order!</Text>

      {!order ? (
        <View style={styles.processingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.processingText}>
            {isPending
              ? "Loading..."
              : "We're finishing up your order - this usually takes just a few seconds. Your order will also show up in your order history."}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.orderNumber}>Order #{order.id.slice(0, 8)}</Text>
          <Text style={styles.helperText}>A confirmation email is on its way.</Text>

          <View style={styles.lineItems}>
            {order.items.map((item) => (
              <View key={item.id} style={styles.lineItemRow}>
                <Text style={styles.lineItemName}>
                  {item.quantity} x {item.name}
                </Text>
                <Text style={styles.lineItemPrice}>{formatPriceCents(item.unitPriceCents * item.quantity)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatPriceCents(order.totalAmountCents)}</Text>
            </View>
          </View>
        </>
      )}

      <Pressable style={styles.doneButton} onPress={() => navigation.popToTop()}>
        <Text style={styles.doneButtonText}>Continue shopping</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    alignItems: "center",
    flexGrow: 1,
  },
  heading: {
    ...typography.sizes["2xl"],
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  processingBox: {
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  processingText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  orderNumber: {
    ...typography.sizes.base,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
  },
  helperText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  lineItems: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  lineItemName: {
    ...typography.sizes.sm,
    color: colors.foreground,
    flex: 1,
    marginRight: spacing.sm,
  },
  lineItemPrice: {
    ...typography.sizes.sm,
    color: colors.foreground,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
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
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    alignItems: "center",
  },
  doneButtonText: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
  },
});
