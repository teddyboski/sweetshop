import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useStripe } from "@stripe/stripe-react-native";
import { useAuth } from "../../lib/auth/auth-context";
import { fetchCart } from "../../lib/api/cart";
import { createCheckoutSession, createPaymentIntent } from "../../lib/api/checkout";
import { formatPriceCents } from "../../lib/utils/format";
import { colors, radii, spacing, typography } from "../../theme";
import type { CartStackParamList } from "../../navigation/CartStack";

type Nav = NativeStackNavigationProp<CartStackParamList, "Checkout">;

/**
 * Milestone 13: two genuinely different checkout paths live in this one
 * screen, on purpose, rather than as two separate screens - which path
 * applies depends on the cart's own contents (subscription vs one-time),
 * not on anything the user picks, so a single screen that branches on
 * cart.lines.some(isSubscription) is simpler than routing to two screens
 * and passing that same flag along.
 *
 * One-time carts: native Stripe Payment Sheet via
 * /api/checkout/payment-intent, with an in-app shipping address form (no
 * hosted-page equivalent exists for the Payment Sheet - see that route's
 * header comment).
 *
 * Subscription-containing carts: falls back to the existing, already-live
 * web checkout flow (/api/checkout/session), opened in an in-app browser
 * tab via expo-web-browser. This is a deliberate scope decision (approved
 * by Ted 2026-08-09), not a temporary stub - building a second Stripe
 * subscription integration (PaymentIntent nested under
 * subscription.latest_invoice) alongside the one-time Payment Sheet work
 * was judged not worth rushing into the same milestone.
 */
export function CheckoutScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const isAuthenticated = Boolean(session);

  const { data: cart, isPending: cartPending } = useQuery({ queryKey: ["cart"], queryFn: fetchCart });

  const [guestEmail, setGuestEmail] = useState("");
  const [name, setName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cartPending || !cart) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const hasSubscription = cart.lines.some((line) => line.isSubscription);

  function validateGuestEmail(): boolean {
    if (!isAuthenticated && !guestEmail.trim()) {
      setError("Enter an email address to check out as a guest.");
      return false;
    }
    return true;
  }

  async function handleSubscriptionCheckout() {
    setError(null);
    if (!validateGuestEmail()) return;

    setSubmitting(true);
    try {
      const { url } = await createCheckoutSession(isAuthenticated ? undefined : guestEmail.trim());
      await WebBrowser.openBrowserAsync(url);
      // Closing the in-app browser tab doesn't by itself tell us whether the
      // payment succeeded - Stripe's webhook is the actual source of truth,
      // exactly as it is on web (this reuses that same, already-live
      // endpoint and webhook). Refreshing the cart here just picks up
      // whatever the webhook has since done: a completed purchase marks the
      // cart 'converted' server-side, so an empty cart on return is the
      // observable signal that it went through.
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong opening checkout.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNativeCheckout() {
    setError(null);
    if (!validateGuestEmail()) return;
    if (!name.trim() || !line1.trim() || !city.trim() || !postalCode.trim() || state.trim().length !== 2) {
      setError("Fill in your full shipping address (state is a 2-letter code, e.g. CA).");
      return;
    }

    setSubmitting(true);
    try {
      const shippingAddress = {
        name: name.trim(),
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        city: city.trim(),
        state: state.trim().toUpperCase(),
        postalCode: postalCode.trim(),
      };

      const { clientSecret, paymentIntentId } = await createPaymentIntent({
        guestEmail: isAuthenticated ? undefined : guestEmail.trim(),
        shippingAddress,
      });

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "Sweet Shop",
        paymentIntentClientSecret: clientSecret,
        defaultShippingDetails: {
          name: shippingAddress.name,
          address: {
            line1: shippingAddress.line1,
            line2: shippingAddress.line2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postalCode: shippingAddress.postalCode,
            country: "US",
          },
        },
        allowsDelayedPaymentMethods: false,
      });
      if (initError) {
        setError(initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        // A user-initiated cancel comes back through this same error field
        // (code "Canceled"), not as a rejected promise - treated as a quiet
        // return to the form rather than an alarming red error banner.
        if (presentError.code !== "Canceled") {
          setError(presentError.message);
        }
        return;
      }

      // Success. The mobile payment_intent.succeeded webhook handler
      // creates the actual order server-side (same "webhook is the source
      // of truth" pattern as web) - OrderConfirmationScreen polls for that
      // row rather than this screen assuming it already exists. Cart cache
      // invalidation happens there once the order is actually confirmed,
      // not here, since the cart isn't marked 'converted' until the webhook
      // runs.
      navigation.replace("OrderConfirmation", { paymentIntentId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong starting checkout.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Total due</Text>
          <Text style={styles.summaryValue}>{formatPriceCents(cart.total.totalCents)}</Text>
        </View>

        {hasSubscription ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Subscription checkout</Text>
            <Text style={styles.helperText}>
              Your cart has a subscription box. Subscriptions are set up through our secure web checkout for now -
              tap below to continue there. Your cart stays exactly as it is.
            </Text>

            {!isAuthenticated && (
              <FormField label="Email" value={guestEmail} onChangeText={setGuestEmail} keyboardType="email-address" autoCapitalize="none" />
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Shipping address</Text>

            {!isAuthenticated && (
              <FormField label="Email" value={guestEmail} onChangeText={setGuestEmail} keyboardType="email-address" autoCapitalize="none" />
            )}
            <FormField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
            <FormField label="Address line 1" value={line1} onChangeText={setLine1} autoCapitalize="words" />
            <FormField label="Address line 2 (optional)" value={line2} onChangeText={setLine2} autoCapitalize="words" />
            <FormField label="City" value={city} onChangeText={setCity} autoCapitalize="words" />
            <View style={styles.row}>
              <View style={styles.rowItemSmall}>
                <FormField label="State" value={state} onChangeText={(v) => setState(v.toUpperCase())} autoCapitalize="characters" maxLength={2} />
              </View>
              <View style={styles.rowItemLarge}>
                <FormField label="ZIP code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" maxLength={10} />
              </View>
            </View>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={styles.submitButton}
          disabled={submitting}
          onPress={hasSubscription ? handleSubscriptionCheckout : handleNativeCheckout}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.submitButtonText}>{hasSubscription ? "Continue to secure checkout" : "Pay now"}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "words" | "characters";
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? "default"}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
        maxLength={props.maxLength}
        placeholderTextColor={colors.mutedForeground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing["4xl"],
  },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    ...typography.sizes.base,
    color: colors.foreground,
  },
  summaryValue: {
    ...typography.sizes.lg,
    fontFamily: typography.fontFamilyMedium,
    color: colors.foreground,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    ...typography.sizes.sm,
    fontFamily: typography.fontFamilyMedium,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  helperText: {
    ...typography.sizes.sm,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
  },
  field: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    ...typography.sizes.xs,
    color: colors.mutedForeground,
    marginBottom: spacing.xs / 2,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.sizes.base,
    color: colors.foreground,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rowItemSmall: {
    width: 90,
  },
  rowItemLarge: {
    flex: 1,
  },
  errorText: {
    ...typography.sizes.sm,
    color: colors.destructive,
    marginBottom: spacing.md,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  submitButtonText: {
    ...typography.sizes.base,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primaryForeground,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
