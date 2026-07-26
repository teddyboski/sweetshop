import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation";

const POINTS_PER_DOLLAR = 1; // Milestone 6 plan, Product Decision #9

export async function POST(request: NextRequest) {
  const stripe = createStripeClient();
  const signature = request.headers.get("stripe-signature");
  // Signature verification needs the exact raw bytes Stripe signed - never
  // request.json() first, which would re-serialize the body and break the
  // signature check. Per CLAUDE.md: always verify before processing.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("Missing stripe-signature header");
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Logged for every event as an audit trail (schema's own stated purpose),
  // but NOT used as the sole gate for checkout.session.completed below -
  // see that handler's comment for why event-id-only idempotency isn't
  // quite enough on its own.
  await admin.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });

  if (event.type === "checkout.session.completed") {
    try {
      await handleCheckoutSessionCompleted(admin, stripe, event.data.object as Stripe.Checkout.Session);
    } catch (error) {
      // Deliberately a non-2xx response even though order creation itself
      // may have already succeeded (see handleCheckoutSessionCompleted's
      // header comment) - this is what makes Stripe redeliver the event so
      // a transient failure (most commonly the confirmation email step) gets
      // retried automatically, without a separate retry queue.
      console.error(`checkout.session.completed processing failed for event ${event.id}:`, error);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  } else if (event.type === "checkout.session.expired") {
    await handleCheckoutSessionExpired(admin, event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

/**
 * Idempotency here is anchored on orders.stripe_checkout_session_id (a
 * unique column) rather than solely on the stripe_events event-id insert
 * above. Reasoning: a naive "skip if this event id was already recorded"
 * gate is correct for the common case (Stripe redelivering an
 * already-fully-processed event), but if THIS handler itself throws
 * partway through (e.g. after the order row is created but before
 * order_items finish), the event id would already be recorded, and a
 * retry would then skip reprocessing entirely - silently leaving a
 * paid order with missing items forever. Checking for the order's actual
 * existence means a retry after a partial failure still does the right
 * thing for the order-creation step. This does NOT make every sub-step
 * (order_items, subscription, rewards) individually idempotent against a
 * failure between them - an accepted, documented V1 simplification; a
 * failure in that narrow window would need manual admin reconciliation,
 * not a scenario justifying full saga-style step tracking for a first
 * checkout implementation.
 *
 * The confirmation email is deliberately NOT covered by the "order already
 * exists, return early" shortcut above - it's checked separately via
 * orders.confirmation_email_sent_at, so a redelivery after an email-only
 * failure still attempts the email without recreating the order/items/
 * subscription/rewards (see that column's migration comment).
 */
async function handleCheckoutSessionCompleted(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const cartId = session.metadata?.cart_id;
  if (!cartId) {
    console.error(`checkout.session.completed for session ${session.id} has no cart_id metadata`);
    return;
  }

  const { data: existingOrder } = await admin
    .from("orders")
    .select("id, confirmation_email_sent_at")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  const orderId = existingOrder ? existingOrder.id : await createOrderFromSession(admin, stripe, session, cartId);

  if (existingOrder?.confirmation_email_sent_at) return;

  await sendOrderConfirmationEmail(admin, orderId);
  await admin.from("orders").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", orderId);
}

async function createOrderFromSession(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  cartId: string
): Promise<string> {
  const userId = session.metadata?.user_id ?? null;
  const guestEmail = session.metadata?.guest_email ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  // Stripe SDK v22+ nests this under collected_information (renamed from the
  // old top-level shipping_details field on Session) - confirmed against the
  // installed package's actual .d.ts, not assumed from API docs memory.
  //
  // Destructured into a plain literal (rather than passing Stripe's own
  // Address object through directly) because Supabase's generated Json type
  // requires an index signature that Stripe's named Address interface
  // doesn't declare - a fresh object literal with primitive fields is
  // structurally compatible with Json, the named interface reference isn't.
  const shippingDetails = session.collected_information?.shipping_details;
  const shippingAddress = shippingDetails
    ? {
        name: shippingDetails.name,
        address: {
          line1: shippingDetails.address.line1,
          line2: shippingDetails.address.line2,
          city: shippingDetails.address.city,
          state: shippingDetails.address.state,
          postal_code: shippingDetails.address.postal_code,
          country: shippingDetails.address.country,
        },
      }
    : null;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      user_id: userId,
      guest_email: guestEmail,
      stripe_payment_intent_id: paymentIntentId,
      stripe_checkout_session_id: session.id,
      status: "paid",
      total_amount_cents: session.amount_total ?? 0,
      shipping_address: shippingAddress,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error(`Failed to create order for session ${session.id}:`, orderError);
    throw orderError ?? new Error("Order insert returned no row");
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ["data.price.product"],
    limit: 100,
  });

  let subscriptionBoxId: string | null = null;

  for (const item of lineItems.data) {
    const product = item.price?.product;
    const cartItemId =
      product && typeof product !== "string" && !product.deleted ? product.metadata?.cart_item_id : undefined;
    if (!cartItemId) continue; // The Shipping line item (Task 2) has no cart_item_id metadata - expected, skip it.

    const { data: cartItem } = await admin
      .from("cart_items")
      .select("item_type, box_id, snack_id, boxes(is_subscription)")
      .eq("id", cartItemId)
      .maybeSingle();

    if (!cartItem) {
      // Rare edge case (Milestone 5's PATCH/DELETE could touch the same
      // cart_item while a Checkout Session is open in another tab) -
      // Stripe's own charge is unaffected; we simply can't attribute this
      // specific line to a box/snack anymore. Skip rather than fail the
      // whole order.
      console.error(`cart_item ${cartItemId} referenced by session ${session.id} no longer exists - skipping order_item`);
      continue;
    }

    if (cartItem.item_type === "box" && cartItem.boxes?.is_subscription && cartItem.box_id) {
      subscriptionBoxId = cartItem.box_id;
    }

    const { data: orderItem, error: orderItemError } = await admin
      .from("order_items")
      .insert({
        order_id: order.id,
        item_type: cartItem.item_type,
        box_id: cartItem.box_id,
        snack_id: cartItem.snack_id,
        quantity: item.quantity ?? 1,
        unit_price_cents: item.price?.unit_amount ?? 0,
      })
      .select("id")
      .single();

    if (orderItemError || !orderItem) {
      console.error(`Failed to create order_item for cart_item ${cartItemId}:`, orderItemError);
      continue;
    }

    const { data: snackSelections } = await admin
      .from("cart_item_snacks")
      .select("snack_id, quantity")
      .eq("cart_item_id", cartItemId);

    if (snackSelections && snackSelections.length > 0) {
      await admin
        .from("order_item_snacks")
        .insert(snackSelections.map((s) => ({ order_item_id: orderItem.id, snack_id: s.snack_id, quantity: s.quantity })));
    }
  }

  await admin.from("carts").update({ status: "converted" }).eq("id", cartId);

  if (session.mode === "subscription" && session.subscription && userId && subscriptionBoxId) {
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    await admin.from("subscriptions").insert({
      user_id: userId,
      box_id: subscriptionBoxId,
      stripe_subscription_id: subscriptionId,
      status: "active",
    });
  }

  // Rewards accrue only for authenticated purchases, never guests, never
  // retroactively - Milestone 6 plan, Product Decisions #7 and #9.
  if (userId) {
    const points = Math.floor((session.amount_total ?? 0) / 100) * POINTS_PER_DOLLAR;
    if (points > 0) {
      await admin.rpc("credit_rewards_points", {
        p_user_id: userId,
        p_delta_points: points,
        p_reason: "order_placed",
        p_order_id: order.id,
      });
    }
  }

  return order.id;
}

async function handleCheckoutSessionExpired(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  session: Stripe.Checkout.Session
) {
  const cartId = session.metadata?.cart_id;
  if (!cartId) return;
  // release_inventory_for_cart is itself idempotent (Task 1) - safe to call
  // even if this event is somehow delivered more than once.
  await admin.rpc("release_inventory_for_cart", { p_cart_id: cartId });
}
