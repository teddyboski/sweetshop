import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createCheckoutSessionSchema } from "@/lib/validations/checkout";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { resolveExistingCartId } from "@/lib/cart/resolve-cart";
import { getCartContents, type CartLine } from "@/lib/supabase/queries/cart";

/**
 * V1 only ever seeds 'monthly' cadence (see the subscription box seed
 * migration) - mapped explicitly rather than guessed, so an unrecognized
 * future cadence fails loudly instead of silently billing on the wrong
 * schedule.
 */
function cadenceToStripeInterval(cadence: string | null): Stripe.PriceCreateParams.Recurring.Interval {
  if (cadence === "monthly") return "month";
  throw new Error(`Unsupported subscription cadence: ${cadence}`);
}

/**
 * Identifying metadata embedded on each Stripe line item's product_data
 * (not the session's own top-level metadata, which only fits one cart_id).
 * Only cart_item_id is needed: a cart_items row's box_id/snack_id/item_type
 * never change after creation (only quantity or existence can), so the
 * checkout.session.completed webhook (Task 3) can safely look up this one
 * specific row by id without re-deriving anything from the whole cart -
 * avoiding any risk of a stale price if the cart changed between session
 * creation and payment confirmation. Stripe's own per-line unit_amount
 * stays the source of truth for what was actually charged; this metadata
 * only supplies the foreign key Stripe has no reason to know about.
 */
function lineItemFor(line: CartLine): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
    currency: "usd",
    product_data: {
      name: line.name,
      metadata: { cart_item_id: line.id },
    },
    unit_amount: line.unitPriceCents,
  };

  // Inline price_data (not a persisted Stripe Price object) so a
  // subscription always bills the box's *current* price_cents at session
  // creation - nothing cached long-term to go stale. See Milestone 6 plan,
  // Product Decision #1. Stripe's subscription-mode Checkout Sessions
  // support mixing recurring and one-time price_data line items in the
  // same session ("mixed cart"), so a subscription box alongside one-time
  // snacks/boxes in the same cart works in a single session.
  if (line.isSubscription) {
    priceData.recurring = { interval: cadenceToStripeInterval(line.cadence) };
  }

  return { price_data: priceData, quantity: line.quantity };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createCheckoutSessionSchema.safeParse(body);
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
  const isAuthenticated = Boolean(cartResult.userId);

  // subscriptions.user_id is not-null with no guest equivalent (unlike
  // orders.guest_email) - there is no schema-supported way to create a
  // subscription for a guest, and no way for them to ever manage it
  // afterward. See Milestone 6 plan, Product Decision #8.
  if (!isAuthenticated && hasSubscriptionLine) {
    return NextResponse.json(
      { data: null, error: { message: "Please create an account to subscribe" } },
      { status: 400 }
    );
  }

  // Guest checkout (Milestone 2's already-migrated schema contract): no
  // bearer token means no user_id, so an email is required up front -
  // never a client-supplied user id substituting for real auth.
  if (!isAuthenticated && !parsed.data.guestEmail) {
    return NextResponse.json(
      { data: null, error: { message: "Email is required for guest checkout" } },
      { status: 400 }
    );
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

  const lineItems = cart.lines.map(lineItemFor);
  if (cart.total.shippingCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Shipping" },
        unit_amount: cart.total.shippingCents,
      },
      quantity: 1,
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
  if (!appUrl) {
    return NextResponse.json(
      { data: null, error: { message: "Server misconfigured: NEXT_PUBLIC_APP_URL is not set" } },
      { status: 500 }
    );
  }

  const stripe = createStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: hasSubscriptionLine ? "subscription" : "payment",
    line_items: lineItems,
    success_url: `${appUrl}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/shop/cart`,
    customer_email: !isAuthenticated ? parsed.data.guestEmail : undefined,
    // Domestic only per the product blueprint ("Shipping: domestic only").
    // Populates session.shipping_details, which the webhook (Task 3)
    // snapshots into orders.shipping_address - without this there would be
    // no address at all to fulfill a physical order against.
    shipping_address_collection: { allowed_countries: ["US"] },
    metadata: {
      cart_id: cartResult.cartId,
      ...(cartResult.userId ? { user_id: cartResult.userId } : {}),
      ...(!isAuthenticated && parsed.data.guestEmail ? { guest_email: parsed.data.guestEmail } : {}),
    },
  });

  return NextResponse.json({ data: { url: session.url, id: session.id }, error: null }, { status: 201 });
}
