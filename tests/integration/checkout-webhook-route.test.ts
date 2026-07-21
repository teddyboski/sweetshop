// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { POST as postCheckoutSession } from "@/app/api/checkout/session/route";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";

// See rls-cross-user.test.ts's header comment: never call a session-mutating
// auth method on the admin client itself - use a separate plain client to
// sign in and obtain a bearer token instead.
const admin = createAdminSupabaseClient();
const stripe = createStripeClient();

let sellableSnackId: string;
let userId: string;
let userToken: string;
const createdCartIds: string[] = [];
const createdOrderIds: string[] = [];
const createdSubscriptionIds: string[] = [];
const inventoryRestores: Array<{ snackId: string; quantity: number }> = [];

const email = `test-webhook-${crypto.randomUUID()}@mailinator.com`;
const password = crypto.randomUUID();

beforeAll(async () => {
  const { data: snack } = await admin
    .from("snacks")
    .select("id")
    .eq("is_sellable_individually", true)
    .limit(1)
    .single();
  sellableSnackId = snack!.id;

  const { data: user, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !user.user) throw createError;
  userId = user.user.id;

  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data: session, error: signInError } = await anonAuthClient.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError;
  userToken = session.session.access_token;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

afterEach(async () => {
  // rewards_ledger.order_id has no ON DELETE CASCADE (deliberately - it's an
  // append-only ledger, see migration comment), so it must be cleared before
  // the order row it references can be deleted. order_items/order_item_snacks
  // DO cascade from orders, so no separate cleanup needed for those.
  for (const orderId of createdOrderIds) {
    await admin.from("rewards_ledger").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  createdOrderIds.length = 0;

  for (const subscriptionId of createdSubscriptionIds) {
    await admin.from("subscriptions").delete().eq("id", subscriptionId);
  }
  createdSubscriptionIds.length = 0;

  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;

  for (const { snackId, quantity } of inventoryRestores) {
    await admin.from("inventory").update({ quantity_on_hand: quantity }).eq("snack_id", snackId);
  }
  inventoryRestores.length = 0;
});

function cartItemRequest(body: unknown, opts: { cookie?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = `anonymous_cart_id=${opts.cookie}`;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/cart/items", { method: "POST", headers, body: JSON.stringify(body) });
}

function checkoutSessionRequest(body: unknown, opts: { cookie?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = `anonymous_cart_id=${opts.cookie}`;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/checkout/session", {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

async function cartIdForAuthenticatedUser(): Promise<string> {
  const { data: cart } = await admin.from("carts").select("id").eq("user_id", userId).eq("status", "active").single();
  return cart!.id;
}

/**
 * Builds a signed webhook request the same way Stripe's own CLI/servers
 * would - real HMAC signature over the exact raw JSON string, generated via
 * the SDK's own test-header helper, keyed off the same STRIPE_WEBHOOK_SECRET
 * the route reads from process.env (loaded from .env.local by
 * vitest.config.ts). This exercises the real constructEvent() signature
 * verification path rather than mocking it away.
 */
function buildSignedEvent(type: string, sessionObject: unknown) {
  const payload = JSON.stringify({
    id: `evt_test_${crypto.randomUUID()}`,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object: sessionObject },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, signature };
}

function webhookRequest(payload: string, signature?: string) {
  const headers: Record<string, string> = {};
  if (signature) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", { method: "POST", headers, body: payload });
}

describe("POST /api/webhooks/stripe", () => {
  it("rejects a request with an invalid signature with 400 and writes no stripe_events row", async () => {
    const fakeEventId = `evt_test_invalid_${crypto.randomUUID()}`;
    const payload = JSON.stringify({ id: fakeEventId, type: "checkout.session.completed", data: { object: {} } });

    const response = await postWebhook(webhookRequest(payload, "t=1,v1=not_a_real_signature"));
    expect(response.status).toBe(400);

    const { data } = await admin.from("stripe_events").select("id").eq("id", fakeEventId).maybeSingle();
    expect(data).toBeNull();
  });

  it("rejects a request with a missing stripe-signature header with 400", async () => {
    const payload = JSON.stringify({ id: `evt_test_${crypto.randomUUID()}`, type: "checkout.session.completed", data: { object: {} } });

    const response = await postWebhook(webhookRequest(payload));
    expect(response.status).toBe(400);
  });

  it("processes checkout.session.completed: creates the order and order_items, credits rewards once, and is idempotent on redelivery", async () => {
    // Two cart-item POSTs, a real Checkout Session creation, and two webhook
    // deliveries (each making a real stripe.checkout.sessions.listLineItems
    // round trip) comfortably exceed Vitest's 5000ms default against live
    // Stripe test-mode APIs.
    const boxResponse = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(boxResponse.status).toBe(201);
    await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: userToken })
    );

    const cartId = await cartIdForAuthenticatedUser();
    createdCartIds.push(cartId);

    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({}, { token: userToken }));
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    // Our test never drives a real card through Checkout's hosted page, so
    // the retrieved session's payment_intent is still null - overriding it
    // here simulates the one field Stripe would only populate once payment
    // actually completes, matching what a real checkout.session.completed
    // payload would contain.
    const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };

    const { data: profileBefore } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();

    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);
    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id, status, total_amount_cents, user_id")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    expect(order).toBeTruthy();
    createdOrderIds.push(order!.id);
    expect(order!.status).toBe("paid");
    expect(order!.user_id).toBe(userId);
    expect(order!.total_amount_cents).toBe(realSession.amount_total);

    const { data: orderItems } = await admin.from("order_items").select("id").eq("order_id", order!.id);
    expect(orderItems).toHaveLength(2);

    const expectedPoints = Math.floor((realSession.amount_total ?? 0) / 100);
    const { data: ledgerRows } = await admin.from("rewards_ledger").select("delta_points").eq("order_id", order!.id);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows![0]!.delta_points).toBe(expectedPoints);

    const { data: profileAfter } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    expect(profileAfter!.rewards_points).toBe((profileBefore!.rewards_points ?? 0) + expectedPoints);

    const { data: cartAfter } = await admin.from("carts").select("status").eq("id", cartId).single();
    expect(cartAfter!.status).toBe("converted");

    // Redelivery: Stripe retries the same event if it doesn't see a fast 2xx.
    // Idempotency is anchored on orders.stripe_checkout_session_id (see the
    // route's own header comment for why), so a second delivery of the exact
    // same event must not create a second order or credit rewards again.
    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: ordersAfterRedelivery } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", checkoutBody.data.id);
    expect(ordersAfterRedelivery).toHaveLength(1);

    const { data: ledgerAfterRedelivery } = await admin.from("rewards_ledger").select("id").eq("order_id", order!.id);
    expect(ledgerAfterRedelivery).toHaveLength(1);

    const { data: profileAfterRedelivery } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    expect(profileAfterRedelivery!.rewards_points).toBe(profileAfter!.rewards_points);
  }, 20000);

  it("processes checkout.session.completed for a subscription: creates a subscriptions row", async () => {
    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "monthly-subscription", quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);

    const cartId = await cartIdForAuthenticatedUser();
    createdCartIds.push(cartId);

    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({}, { token: userToken }));
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const fakeSubscriptionId = `sub_test_${crypto.randomUUID()}`;
    const completedSession = { ...realSession, payment_intent: null, subscription: fakeSubscriptionId };

    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);
    const webhookResponse = await postWebhook(webhookRequest(payload, signature));
    expect(webhookResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("id, status, stripe_subscription_id")
      .eq("user_id", userId)
      .eq("stripe_subscription_id", fakeSubscriptionId)
      .maybeSingle();
    expect(subscription).toBeTruthy();
    expect(subscription!.status).toBe("active");
    createdSubscriptionIds.push(subscription!.id);
  });

  it("processes checkout.session.expired: releases reserved inventory back to its pre-checkout level", async () => {
    const { data: originalInventory } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", sellableSnackId)
      .single();
    const originalQuantity = originalInventory!.quantity_on_hand;
    inventoryRestores.push({ snackId: sellableSnackId, quantity: originalQuantity });

    const response = await postCartItem(cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 2 }));
    const body = await response.json();
    const cookieValue = response.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", body.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-expired@example.com" }, { cookie: cookieValue })
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const { data: reservedInventory } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", sellableSnackId)
      .single();
    expect(reservedInventory!.quantity_on_hand).toBe(originalQuantity - 2);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const { payload, signature } = buildSignedEvent("checkout.session.expired", realSession);
    const webhookResponse = await postWebhook(webhookRequest(payload, signature));
    expect(webhookResponse.status).toBe(200);

    const { data: releasedInventory } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", sellableSnackId)
      .single();
    expect(releasedInventory!.quantity_on_hand).toBe(originalQuantity);
  });
});
