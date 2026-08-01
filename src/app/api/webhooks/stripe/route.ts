import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation";

const POINTS_PER_DOLLAR = 1; // Milestone 6 plan, Product Decision #9
const REFERRAL_REWARD_POINTS = 500; // Milestone 9 plan, Product Decision #1

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
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    try {
      await handleSubscriptionSync(admin, event.data.object as Stripe.Subscription);
    } catch (error) {
      console.error(`${event.type} processing failed for event ${event.id}:`, error);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  } else if (event.type === "invoice.paid") {
    try {
      await handleInvoicePaid(admin, event.data.object as Stripe.Invoice);
    } catch (error) {
      console.error(`invoice.paid processing failed for event ${event.id}:`, error);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
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

  // Milestone 7, Task 2: capture the Stripe Customer id Checkout created (a
  // subscription-mode session always has one) so the account's "Manage
  // Subscription" Billing Portal session (portal-session route) has a
  // customer to scope to. Never overwrite an already-captured id - .is()
  // guard makes this a no-op after the first subscription checkout, exactly
  // like the update path prevent_profile_privilege_escalation's service_role
  // exemption already allows (see that migration's header comment).
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  if (userId && stripeCustomerId) {
    await admin.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", userId).is("stripe_customer_id", null);
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

    // Milestone 8, Task 8: customer_activity backfill. Guests have no
    // user_id (the column is not-null), so this is authenticated-only, same
    // scope as rewards accrual just above. Awaited (not fire-and-forget) so
    // a failure is visible, but doesn't fail the webhook - the order itself
    // already committed successfully.
    const { error: activityError } = await admin
      .from("customer_activity")
      .insert({ user_id: userId, event_type: "order_placed", metadata: { order_id: order.id } });
    if (activityError) {
      console.error(`Failed to log order_placed activity for order ${order.id}:`, activityError);
    }
  }

  // Milestone 9: promo usage and points redemption are only committed here,
  // on first delivery (this whole function only runs when no order exists
  // yet for this session - see handleCheckoutSessionCompleted's own
  // idempotency comment), never on a webhook redelivery. Both are
  // re-validated atomically at the DB layer (not just trusted from session
  // creation), since a promo could hit its limit or a balance could change
  // in the window between session creation and payment confirmation - if
  // either guard now fails, the payment has already succeeded, so this
  // logs and moves on rather than failing the whole order.
  const promotionId = session.metadata?.promotion_id ?? null;
  if (promotionId) {
    const { data: incremented, error: promoError } = await admin.rpc("increment_promotion_used_count", {
      p_promotion_id: promotionId,
    });
    if (promoError || incremented === false) {
      console.error(`Promotion ${promotionId} usage could not be recorded for order ${order.id} (paid=true):`, promoError);
    }
  }

  const redeemedPointsRaw = session.metadata?.redeemed_points;
  if (userId && redeemedPointsRaw) {
    const redeemedPoints = Number(redeemedPointsRaw);
    const { data: redeemed, error: redeemError } = await admin.rpc("redeem_rewards_points", {
      p_user_id: userId,
      p_points: redeemedPoints,
      p_order_id: order.id,
    });
    if (redeemError || redeemed === false) {
      console.error(`Points redemption could not be recorded for order ${order.id} (paid=true):`, redeemError);
    } else {
      await admin.from("customer_activity").insert({
        user_id: userId,
        event_type: "reward_redeemed",
        metadata: { order_id: order.id, points: redeemedPoints },
      });
    }
  }

  // Referral crediting: fires on the referred user's qualifying first
  // purchase - gated on a still-'pending' referrals row, so it can only
  // ever fire once per referred account (Milestone 9 plan's "cap one
  // reward per referred account"). Guests are never eligible (no
  // referred_by relationship possible without an account).
  if (userId) {
    const { data: referredProfile } = await admin
      .from("profiles")
      .select("referred_by, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (referredProfile?.referred_by) {
      const { data: pendingReferral } = await admin
        .from("referrals")
        .select("id")
        .eq("referred_id", userId)
        .eq("referrer_id", referredProfile.referred_by)
        .eq("status", "pending")
        .maybeSingle();

      if (pendingReferral) {
        const { data: referrerProfile } = await admin
          .from("profiles")
          .select("stripe_customer_id")
          .eq("id", referredProfile.referred_by)
          .single();

        // Abuse guard beyond the DB's own referrer_id <> referred_id
        // constraint: skip (leave pending, no error) if both accounts
        // share a payment method - see plan doc's engineering decisions.
        const sharesPaymentMethod =
          referrerProfile?.stripe_customer_id &&
          referredProfile.stripe_customer_id &&
          referrerProfile.stripe_customer_id === referredProfile.stripe_customer_id;

        if (!sharesPaymentMethod) {
          await admin.rpc("credit_rewards_points", {
            p_user_id: referredProfile.referred_by,
            p_delta_points: REFERRAL_REWARD_POINTS,
            p_reason: "referral_referrer_credit",
            p_order_id: null,
          });
          await admin.rpc("credit_rewards_points", {
            p_user_id: userId,
            p_delta_points: REFERRAL_REWARD_POINTS,
            p_reason: "referral_referred_credit",
            p_order_id: order.id,
          });
          await admin
            .from("referrals")
            .update({ status: "credited", reward_issued_at: new Date().toISOString() })
            .eq("id", pendingReferral.id);
        }
      }
    }
  }

  return order.id;
}

/**
 * Milestone 8, Task 1B: records subscription renewal revenue, which is
 * otherwise invisible to `orders` entirely - checkout.session.completed
 * only ever fires once, for a subscription's first invoice.
 * invoice.paid fires for that first invoice AND every renewal;
 * `billing_reason` is what tells them apart: 'subscription_create' is the
 * first invoice (already handled above - processing it again here would
 * double-count that same payment), 'subscription_cycle' is a renewal.
 * Only the latter creates a new order here.
 *
 * `stripe_payment_intent_id` is left null for these orders: this Stripe
 * API version has no direct payment_intent field on Invoice at all (only
 * reachable via the separate, paginated `invoice.payments` sub-resource,
 * confirmed against the installed package's actual .d.ts, not assumed).
 * Product Decision #1 already scopes the admin Refund button (Task 6) to
 * one-time-payment orders only - refunding a specific renewal invoice is
 * explicitly out of scope for that button, so nothing will ever read this
 * field for a renewal-created order.
 *
 * Idempotency: keyed off a synthetic `stripe_checkout_session_id` value
 * (`invoice_<invoice.id>`) rather than a real session id, since no
 * Checkout Session exists for a renewal - mirrors
 * handleCheckoutSessionCompleted's own idempotency anchor exactly.
 *
 * customer_activity logging is added in Task 8 alongside the other two
 * already-existing endpoints identified there, not here - keeping this
 * function scoped to the actual Task 1B addition (order creation +
 * rewards).
 */
async function handleInvoicePaid(admin: ReturnType<typeof createAdminSupabaseClient>, invoice: Stripe.Invoice) {
  if (invoice.billing_reason !== "subscription_cycle") return;

  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  if (!stripeSubscriptionId) {
    console.error(
      `invoice.paid ${invoice.id} has billing_reason subscription_cycle but no parent.subscription_details.subscription`
    );
    return;
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("user_id, box_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (!subscription) {
    console.error(`invoice.paid ${invoice.id}: no local subscriptions row for ${stripeSubscriptionId}`);
    return;
  }

  const syntheticSessionId = `invoice_${invoice.id}`;
  const { data: existingOrder } = await admin
    .from("orders")
    .select("id")
    .eq("stripe_checkout_session_id", syntheticSessionId)
    .maybeSingle();
  if (existingOrder) return; // Already processed this invoice - redelivery, no-op.

  const { data: defaultAddress } = await admin
    .from("customer_addresses")
    .select("recipient_name, line1, line2, city, state, postal_code, country")
    .eq("user_id", subscription.user_id)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();

  const shippingAddress = defaultAddress
    ? {
        name: defaultAddress.recipient_name,
        address: {
          line1: defaultAddress.line1,
          line2: defaultAddress.line2,
          city: defaultAddress.city,
          state: defaultAddress.state,
          postal_code: defaultAddress.postal_code,
          country: defaultAddress.country,
        },
      }
    : null;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      user_id: subscription.user_id,
      stripe_payment_intent_id: null,
      stripe_checkout_session_id: syntheticSessionId,
      status: "paid",
      total_amount_cents: invoice.amount_paid,
      shipping_address: shippingAddress,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error(`Failed to create renewal order for invoice ${invoice.id}:`, orderError);
    throw orderError ?? new Error("Order insert returned no row");
  }

  await admin.from("order_items").insert({
    order_id: order.id,
    item_type: "box",
    box_id: subscription.box_id,
    quantity: 1,
    unit_price_cents: invoice.amount_paid,
  });

  // Renewals earn rewards same as any other confirmed payment - Milestone 6
  // Decision #9's "1 point per dollar spent" wasn't scoped to first
  // payments only. Distinct reason from the initial purchase's
  // 'order_placed' so the ledger (Task 9's admin view) can tell them apart.
  const points = Math.floor(invoice.amount_paid / 100) * POINTS_PER_DOLLAR;
  if (points > 0) {
    await admin.rpc("credit_rewards_points", {
      p_user_id: subscription.user_id,
      p_delta_points: points,
      p_reason: "subscription_renewal",
      p_order_id: order.id,
    });
  }

  // Milestone 8, Task 8: customer_activity backfill - see
  // handleCheckoutSessionCompleted's identical block for the same rationale.
  const { error: activityError } = await admin
    .from("customer_activity")
    .insert({ user_id: subscription.user_id, event_type: "order_placed", metadata: { order_id: order.id } });
  if (activityError) {
    console.error(`Failed to log order_placed activity for renewal order ${order.id}:`, activityError);
  }
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

/**
 * subscriptions.status only supports ('active', 'paused', 'cancelled',
 * 'past_due') - narrower than Stripe's own status enum. `trialing` collapses
 * to 'active' (no separate trial state in this schema); `unpaid`,
 * `incomplete`, and `incomplete_expired` collapse to 'past_due' as the
 * closest "not currently deliverable, not yet a hard cancellation" match -
 * V1 has no dedicated handling for those rarer terminal/pre-activation
 * states. Note the spelling difference: Stripe's `canceled` (one L) maps to
 * this schema's `cancelled` (two Ls, the check constraint's actual spelling).
 */
function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): "active" | "paused" | "cancelled" | "past_due" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "paused":
      return "paused";
    case "canceled":
      return "cancelled";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past_due";
    default:
      return "past_due";
  }
}

/**
 * Milestone 7, Task 2: keeps the local subscriptions row in sync with
 * whatever the customer just did inside Stripe's hosted Customer Portal
 * (pause, cancel, etc.) - the Portal changes Stripe's state first, our DB
 * is the mirror, same pattern as the checkout webhook above. Naturally
 * idempotent on redelivery: this is a pure UPDATE reflecting Stripe's
 * current state, so applying the same event twice (or events arriving
 * out of order) converges on the same row - no separate idempotency
 * ledger needed beyond the stripe_events audit upsert already done for
 * every event in POST above.
 *
 * `current_period_end` moved off the top-level Subscription object in
 * newer Stripe API versions onto each subscription item (confirmed against
 * the installed package's actual .d.ts, not assumed) - the first item's
 * value is used as next_delivery_at, matching this app's one-item-per-
 * subscription checkout flow.
 */
async function handleSubscriptionSync(admin: ReturnType<typeof createAdminSupabaseClient>, subscription: Stripe.Subscription) {
  const nextDeliveryAtSeconds = subscription.items.data[0]?.current_period_end;
  const mappedStatus = mapStripeSubscriptionStatus(subscription.status);

  // Read the pre-update status first so the customer_activity insert below
  // can tell a genuine pause *transition* apart from a redelivery of an
  // event that already applied (the UPDATE itself has no such distinction -
  // it's a pure state mirror, per this function's own idempotency note).
  const { data: before } = await admin
    .from("subscriptions")
    .select("status")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const { data, error } = await admin
    .from("subscriptions")
    .update({
      status: mappedStatus,
      next_delivery_at: nextDeliveryAtSeconds ? new Date(nextDeliveryAtSeconds * 1000).toISOString() : null,
    })
    .eq("stripe_subscription_id", subscription.id)
    .select("id, user_id");

  if (error) {
    console.error(`Failed to sync subscription ${subscription.id}:`, error);
    throw error;
  }

  if (!data || data.length === 0) {
    // Not one of ours (e.g. a subscription created directly in the Stripe
    // Dashboard, or a redelivery after the row was somehow removed) -
    // logged for visibility, not an error worth failing/retrying the
    // webhook over.
    console.error(`customer.subscription event for ${subscription.id} has no matching local subscriptions row`);
    return;
  }

  // Milestone 8, Task 8: customer_activity backfill. customer_activity's
  // event_type check constraint only has a 'subscription_paused' value (no
  // 'subscription_cancelled'/'subscription_resumed' - see the initial schema
  // migration), so only the 'paused' status transition is logged here; other
  // status changes have no matching event_type to record. Gated on
  // before?.status !== "paused" (not just the new status) so a redelivered
  // event that was already applied doesn't write a second row.
  if (mappedStatus === "paused" && before?.status !== "paused") {
    const { error: activityError } = await admin
      .from("customer_activity")
      .insert({ user_id: data[0]!.user_id, event_type: "subscription_paused" });
    if (activityError) {
      console.error(`Failed to log subscription_paused activity for subscription ${subscription.id}:`, activityError);
    }
  }
}
