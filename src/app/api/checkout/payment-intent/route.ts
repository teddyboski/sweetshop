import { NextRequest, NextResponse } from "next/server";
import { createPaymentIntentSchema } from "@/lib/validations/checkout";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { resolveExistingCartId } from "@/lib/cart/resolve-cart";
import { getCartContents } from "@/lib/supabase/queries/cart";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 13 (mobile): native Payment Sheet checkout, deliberately a
 * SEPARATE endpoint from /api/checkout/session rather than a shared/
 * refactored code path. Two real reasons, not just caution for its own
 * sake:
 *
 * 1. Different Stripe object entirely. The web app's endpoint creates a
 *    hosted Checkout Session (returns a `url` to redirect to); the mobile
 *    Payment Sheet needs a PaymentIntent client_secret directly. A Checkout
 *    Session's underlying PaymentIntent *can* be extracted, but that
 *    session was built assuming Stripe's own hosted page collects the
 *    shipping address - bypassing that page (as the native Payment Sheet
 *    does) would silently stop collecting shipping addresses for mobile
 *    orders. This endpoint takes a shippingAddress in the request body
 *    instead and puts it directly on the PaymentIntent.
 *
 * 2. One-time purchases only, on purpose (mobile roadmap Milestone 13
 *    scope decision, approved by Ted 2026-08-09). Stripe subscriptions
 *    don't have a simple PaymentIntent the way one-time payments do (it's
 *    nested under subscription.latest_invoice.payment_intent, a materially
 *    bigger integration). A cart containing a subscription box is rejected
 *    here with a clear error - CartScreen falls back to opening the
 *    existing, already-working web checkout URL for that case, so
 *    subscription purchases still work on mobile without a second Stripe
 *    subscription integration being rushed alongside this one.
 *
 * Everything else (rate limit, cart resolution, guest email requirement,
 * promo/rewards validation, inventory reservation) mirrors
 * /api/checkout/session/route.ts's logic exactly, on purpose - same rules,
 * same order, just a different object created at the end.
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.checkout);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = createPaymentIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const cartResult = await resolveExistingCartId(request, admin);
  if (cartResult.error) {
    return NextResponse.json({ data: null, error: { message: cartResult.error } }, { status: cartResult.status! });
  }
  if (!cartResult.cartId) {
    return NextResponse.json({ data: null, error: { message: "Your cart is empty" } }, { status: 400 });
  }

  const cart = await getCartContents(cartResult.cartId);
  if (cart.lines.length === 0) {
    return NextResponse.json({ data: null, error: { message: "Your cart is empty" } }, { status: 400 });
  }

  const hasSubscriptionLine = cart.lines.some((line) => line.isSubscription);
  if (hasSubscriptionLine) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            "Subscription boxes can't be purchased through the app yet - please check out on sweetshopcentral.com to subscribe.",
        },
      },
      { status: 400 }
    );
  }

  const isAuthenticated = Boolean(cartResult.userId);
  if (!isAuthenticated && !parsed.data.guestEmail) {
    return NextResponse.json(
      { data: null, error: { message: "Email is required for guest checkout" } },
      { status: 400 }
    );
  }

  let promotionId: string | null = null;
  let promoDiscountCents = 0;
  if (parsed.data.promoCode) {
    const { data: promotion } = await admin
      .from("promotions")
      .select("id, discount_type, value, usage_limit, used_count, expires_at")
      .eq("code", parsed.data.promoCode.toUpperCase())
      .maybeSingle();

    const isUsable =
      promotion &&
      (promotion.usage_limit === null || promotion.used_count < promotion.usage_limit) &&
      (promotion.expires_at === null || new Date(promotion.expires_at) > new Date());

    if (!isUsable) {
      return NextResponse.json({ data: null, error: { message: "That promo code isn't valid" } }, { status: 400 });
    }

    promotionId = promotion.id;
    promoDiscountCents =
      promotion.discount_type === "percent"
        ? Math.round((cart.total.subtotalCents * Number(promotion.value)) / 100)
        : Math.round(Number(promotion.value));
  }

  let redeemedPoints = 0;
  if (parsed.data.redeemPoints) {
    if (!isAuthenticated) {
      return NextResponse.json(
        { data: null, error: { message: "Log in to redeem rewards points" } },
        { status: 400 }
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("rewards_points")
      .eq("id", cartResult.userId!)
      .single();

    if (!profile || profile.rewards_points < parsed.data.redeemPoints) {
      return NextResponse.json(
        { data: null, error: { message: "You don't have enough rewards points for that" } },
        { status: 400 }
      );
    }

    redeemedPoints = parsed.data.redeemPoints;
  }

  const { error: reservationError } = await admin.rpc("reserve_inventory_for_cart", {
    p_cart_id: cartResult.cartId,
  });
  if (reservationError) {
    return NextResponse.json(
      { data: null, error: { message: "One or more items in your cart are out of stock" } },
      { status: 409 }
    );
  }

  const totalDiscountCents = Math.min(promoDiscountCents + redeemedPoints, cart.total.totalCents);
  const amountCents = cart.total.totalCents - totalDiscountCents;

  if (amountCents < 50) {
    // Stripe's own minimum charge floor (roughly $0.50 USD) - a cart this
    // small after discounts can't be charged at all. Extremely unlikely in
    // practice (cheapest snack is well above this), but a clear error beats
    // a confusing Stripe API failure.
    return NextResponse.json(
      { data: null, error: { message: "Order total is too low to charge" } },
      { status: 400 }
    );
  }

  const stripe = createStripeClient();
  const addr = parsed.data.shippingAddress;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    receipt_email: !isAuthenticated ? parsed.data.guestEmail : undefined,
    shipping: {
      name: addr.name,
      address: {
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        state: addr.state,
        postal_code: addr.postalCode,
        country: "US",
      },
    },
    metadata: {
      cart_id: cartResult.cartId,
      ...(cartResult.userId ? { user_id: cartResult.userId } : {}),
      ...(!isAuthenticated && parsed.data.guestEmail ? { guest_email: parsed.data.guestEmail } : {}),
      ...(promotionId ? { promotion_id: promotionId } : {}),
      ...(redeemedPoints > 0 ? { redeemed_points: String(redeemedPoints) } : {}),
      source: "mobile",
    },
  });

  return NextResponse.json(
    { data: { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id }, error: null },
    { status: 201 }
  );
}
