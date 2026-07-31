// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";

// Milestone 8, Task 1B: invoice.paid is the event Stripe fires for a
// subscription's first payment AND every renewal - checkout.session.completed
// only ever fires once. This test seeds a subscription directly (no live
// checkout flow needed, that path is already covered by
// checkout-webhook-route.test.ts) and asserts only the renewal
// (billing_reason: subscription_cycle) case creates a new order here.

const admin = createAdminSupabaseClient();
const stripe = createStripeClient();

let userId: string;
let subscriptionBoxId: string;
const stripeSubscriptionId = `sub_test_renewal_${crypto.randomUUID()}`;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const email = `test-invoice-paid-${crypto.randomUUID()}@mailinator.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !created.user) throw error;
  userId = created.user.id;

  const { data: box } = await admin.from("boxes").select("id").eq("is_subscription", true).limit(1).single();
  subscriptionBoxId = box!.id;

  await admin.from("subscriptions").insert({
    user_id: userId,
    box_id: subscriptionBoxId,
    stripe_subscription_id: stripeSubscriptionId,
    status: "active",
  });
});

afterAll(async () => {
  await admin.from("subscriptions").delete().eq("stripe_subscription_id", stripeSubscriptionId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

afterEach(async () => {
  // customer_activity has no ON DELETE CASCADE from profiles - see
  // admin-customers-queries.test.ts's afterEach comment - so it's cleared
  // explicitly here too, ahead of afterAll's deleteUser call.
  await admin.from("customer_activity").delete().eq("user_id", userId);

  for (const orderId of createdOrderIds) {
    await admin.from("rewards_ledger").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  createdOrderIds.length = 0;
});

function fakeInvoice(billingReason: string, invoiceId: string, amountPaid: number) {
  return {
    id: invoiceId,
    object: "invoice",
    billing_reason: billingReason,
    amount_paid: amountPaid,
    parent: { type: "subscription_details", subscription_details: { subscription: stripeSubscriptionId } },
  };
}

// Same pattern as checkout-webhook-route.test.ts's buildSignedEvent/webhookRequest.
function buildSignedEvent(type: string, dataObject: unknown) {
  const payload = JSON.stringify({
    id: `evt_test_${crypto.randomUUID()}`,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object: dataObject },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  return { payload, signature };
}

function webhookRequest(payload: string, signature: string) {
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

describe("POST /api/webhooks/stripe - invoice.paid", () => {
  it("a subscription_cycle invoice creates exactly one new order/order_item and credits rewards once", async () => {
    const invoiceId = `in_test_${crypto.randomUUID()}`;
    const { data: profileBefore } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();

    const { payload, signature } = buildSignedEvent("invoice.paid", fakeInvoice("subscription_cycle", invoiceId, 5000));
    const response = await postWebhook(webhookRequest(payload, signature));
    expect(response.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, status, total_amount_cents, stripe_payment_intent_id")
      .eq("stripe_checkout_session_id", `invoice_${invoiceId}`)
      .single();
    expect(order).toBeTruthy();
    createdOrderIds.push(order!.id);
    expect(order!.user_id).toBe(userId);
    expect(order!.status).toBe("paid");
    expect(order!.total_amount_cents).toBe(5000);
    expect(order!.stripe_payment_intent_id).toBeNull();

    const { data: orderItems } = await admin.from("order_items").select("box_id, item_type, unit_price_cents").eq("order_id", order!.id);
    expect(orderItems).toHaveLength(1);
    expect(orderItems![0].item_type).toBe("box");
    expect(orderItems![0].box_id).toBe(subscriptionBoxId);
    expect(orderItems![0].unit_price_cents).toBe(5000);

    const { data: ledgerRows } = await admin
      .from("rewards_ledger")
      .select("delta_points, reason")
      .eq("order_id", order!.id);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows![0].delta_points).toBe(50);
    expect(ledgerRows![0].reason).toBe("subscription_renewal");

    const { data: profileAfter } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    expect(profileAfter!.rewards_points).toBe((profileBefore!.rewards_points ?? 0) + 50);

    // Milestone 8, Task 8: customer_activity backfill.
    const { data: activityRows } = await admin
      .from("customer_activity")
      .select("event_type, metadata")
      .eq("user_id", userId)
      .eq("event_type", "order_placed");
    expect(activityRows).toHaveLength(1);
    expect(activityRows![0]!.metadata).toEqual({ order_id: order!.id });

    // Redelivery: must not create a second order or credit rewards again.
    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: ordersAfterRedelivery } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", `invoice_${invoiceId}`);
    expect(ordersAfterRedelivery).toHaveLength(1);

    const { data: profileAfterRedelivery } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    expect(profileAfterRedelivery!.rewards_points).toBe(profileAfter!.rewards_points);

    const { data: activityAfterRedelivery } = await admin
      .from("customer_activity")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "order_placed");
    expect(activityAfterRedelivery).toHaveLength(1);
  }, 20000);

  it("a subscription_create invoice is skipped - no order created (already handled by checkout.session.completed)", async () => {
    const invoiceId = `in_test_${crypto.randomUUID()}`;
    const { payload, signature } = buildSignedEvent("invoice.paid", fakeInvoice("subscription_create", invoiceId, 5000));

    const response = await postWebhook(webhookRequest(payload, signature));
    expect(response.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", `invoice_${invoiceId}`)
      .maybeSingle();
    expect(order).toBeNull();
  });
});
