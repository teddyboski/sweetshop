// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { POST as postCheckoutSession } from "@/app/api/checkout/session/route";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";

// Per the Milestone 6 plan (Task 4): the Resend call itself is
// mocked/captured, not actually sent - real sends would (a) be rejected
// outright for any recipient other than the Resend account's own owner
// email, since the sandbox sender can't deliver elsewhere until a domain is
// verified, and (b) slow every webhook test down with a real third-party
// network call on every delivery, including the deliberate duplicate-
// delivery assertions below. This does NOT mock Supabase or Stripe - both
// still hit the real APIs, consistent with this repo's "never mock the
// database" convention; Resend is the one deliberate, plan-approved
// exception. vi.mock calls are hoisted above imports by Vitest's transform,
// so this takes effect before the webhook route (which imports the Resend
// client) is ever loaded.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("@/lib/resend/client", () => ({
  createResendClient: () => ({ emails: { send: mockSend } }),
  RESEND_FROM_EMAIL: "onboarding@resend.dev",
}));

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
const createdPromotionIds: string[] = [];
// Milestone 9: referral tests need their own referrer/referred pair, kept
// separate from the main `userId` fixture used by every other test in this
// file (which has no referred_by relationship).
const extraUserIds: string[] = [];
let rewardsBalanceBeforeAll: number;

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

  const { data: profile } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
  rewardsBalanceBeforeAll = profile?.rewards_points ?? 0;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: `email_test_${crypto.randomUUID()}` }, error: null });
});

afterEach(async () => {
  // customer_activity has no ON DELETE CASCADE from profiles - see
  // admin-customers-queries.test.ts's afterEach comment - so it's cleared
  // explicitly here too, ahead of afterAll's deleteUser call.
  await admin.from("customer_activity").delete().eq("user_id", userId);

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

  for (const id of createdPromotionIds) {
    await admin.from("promotions").delete().eq("id", id);
  }
  createdPromotionIds.length = 0;

  // Referrer bonus ledger rows have order_id null (see the webhook's
  // credit_rewards_points call for referral_referrer_credit), so they
  // aren't cleared by the createdOrderIds loop above - cleared explicitly
  // here by user_id instead, same pattern as rewards-referrals-foundations.
  for (const id of extraUserIds) {
    await admin.from("customer_activity").delete().eq("user_id", id);
    await admin.from("referrals").delete().or(`referrer_id.eq.${id},referred_id.eq.${id}`);
    await admin.from("rewards_ledger").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  extraUserIds.length = 0;

  await admin.from("profiles").update({ rewards_points: rewardsBalanceBeforeAll }).eq("id", userId);
});

async function seedPromotion(
  overrides: Partial<{ discountType: "percent" | "fixed"; value: number; usageLimit: number | null }> = {}
) {
  const { data, error } = await admin
    .from("promotions")
    .insert({
      code: `TEST${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      discount_type: overrides.discountType ?? "fixed",
      value: overrides.value ?? 100,
      usage_limit: overrides.usageLimit ?? null,
    })
    .select("id, code")
    .single();
  if (error || !data) throw error;
  createdPromotionIds.push(data.id);
  return data;
}

async function createUser(prefix: string, userMetadata?: Record<string, unknown>) {
  const userEmail = `test-${prefix}-${crypto.randomUUID()}@mailinator.com`;
  const userPassword = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email: userEmail,
    password: userPassword,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (error || !data.user) throw error;
  extraUserIds.push(data.user.id);

  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data: signIn, error: signInError } = await anonAuthClient.auth.signInWithPassword({
    email: userEmail,
    password: userPassword,
  });
  if (signInError || !signIn.session) throw signInError;

  return { id: data.user.id, token: signIn.session.access_token };
}

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
      .select("id, status, total_amount_cents, user_id, confirmation_email_sent_at")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    expect(order).toBeTruthy();
    createdOrderIds.push(order!.id);
    expect(order!.status).toBe("paid");
    expect(order!.user_id).toBe(userId);
    expect(order!.total_amount_cents).toBe(realSession.amount_total);
    expect(order!.confirmation_email_sent_at).toBeTruthy();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: email,
        subject: expect.stringContaining(order!.id.slice(0, 8)),
        text: expect.stringContaining(`$${(realSession.amount_total! / 100).toFixed(2)}`),
      })
    );

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

    // Milestone 8, Task 8: customer_activity backfill.
    const { data: activityRows } = await admin
      .from("customer_activity")
      .select("event_type, metadata")
      .eq("user_id", userId)
      .eq("event_type", "order_placed");
    expect(activityRows).toHaveLength(1);
    expect(activityRows![0]!.metadata).toEqual({ order_id: order!.id });

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

    // confirmation_email_sent_at was already set after the first delivery,
    // so the redelivery's "order exists AND email already sent" branch
    // should short-circuit before ever calling Resend again.
    expect(mockSend).toHaveBeenCalledTimes(1);

    const { data: activityAfterRedelivery } = await admin
      .from("customer_activity")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "order_placed");
    expect(activityAfterRedelivery).toHaveLength(1);
  }, 20000);

  it("when the confirmation email fails to send, returns 500 without recreating the order, then a redelivery sends it without double-crediting rewards", async () => {
    const response = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);

    const cartId = await cartIdForAuthenticatedUser();
    createdCartIds.push(cartId);

    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({}, { token: userToken }));
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };
    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);

    mockSend.mockResolvedValueOnce({ data: null, error: { message: "simulated Resend outage" } });

    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(500);

    // Order creation itself doesn't depend on the email succeeding - it
    // already committed before the email step ran.
    const { data: orderAfterFailure } = await admin
      .from("orders")
      .select("id, confirmation_email_sent_at")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    expect(orderAfterFailure).toBeTruthy();
    createdOrderIds.push(orderAfterFailure!.id);
    expect(orderAfterFailure!.confirmation_email_sent_at).toBeNull();

    const { data: ledgerAfterFailure } = await admin
      .from("rewards_ledger")
      .select("id")
      .eq("order_id", orderAfterFailure!.id);
    expect(ledgerAfterFailure).toHaveLength(1);
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Stripe redelivers on a non-2xx response - simulated here by POSTing
    // the exact same signed payload again. mockSend now resolves
    // successfully (beforeEach's default, since mockResolvedValueOnce only
    // applied to the first call above).
    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: orderAfterRetry } = await admin
      .from("orders")
      .select("id, confirmation_email_sent_at")
      .eq("stripe_checkout_session_id", checkoutBody.data.id);
    expect(orderAfterRetry).toHaveLength(1); // not recreated
    expect(orderAfterRetry![0]!.confirmation_email_sent_at).toBeTruthy();

    const { data: ledgerAfterRetry } = await admin
      .from("rewards_ledger")
      .select("id")
      .eq("order_id", orderAfterFailure!.id);
    expect(ledgerAfterRetry).toHaveLength(1); // not double-credited

    expect(mockSend).toHaveBeenCalledTimes(2);
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

  it("processes checkout.session.completed for a guest: emails the guest address directly and credits no rewards", async () => {
    const response = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const body = await response.json();
    const cookieValue = response.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", body.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const guestEmail = `guest-webhook-${crypto.randomUUID()}@mailinator.com`;
    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({ guestEmail }, { cookie: cookieValue }));
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };
    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);

    const webhookResponse = await postWebhook(webhookRequest(payload, signature));
    expect(webhookResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, guest_email, confirmation_email_sent_at")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    createdOrderIds.push(order!.id);
    expect(order!.user_id).toBeNull();
    expect(order!.guest_email).toBe(guestEmail);
    expect(order!.confirmation_email_sent_at).toBeTruthy();

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: guestEmail }));

    // Product Decision #7: rewards never accrue on guest orders.
    const { data: ledgerRows } = await admin.from("rewards_ledger").select("id").eq("order_id", order!.id);
    expect(ledgerRows).toHaveLength(0);

    // Milestone 8, Task 8: same scope as rewards - customer_activity.user_id
    // is not-null, so guest orders (no user_id) have nothing to log against.
    const { data: activityRows } = await admin
      .from("customer_activity")
      .select("id")
      .contains("metadata", { order_id: order!.id });
    expect(activityRows).toHaveLength(0);
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

  // Milestone 9, Task 4.
  it("increments the promotion's used_count exactly once, not again on redelivery", async () => {
    const promotion = await seedPromotion({ discountType: "fixed", value: 100 });

    const response = await postCartItem(cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }));
    const body = await response.json();
    const cookieValue = response.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", body.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-promo-webhook@example.com", promoCode: promotion.code }, { cookie: cookieValue })
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };
    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);

    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: promoAfterFirst } = await admin.from("promotions").select("used_count").eq("id", promotion.id).single();
    expect(promoAfterFirst!.used_count).toBe(1);

    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: promoAfterRedelivery } = await admin.from("promotions").select("used_count").eq("id", promotion.id).single();
    expect(promoAfterRedelivery!.used_count).toBe(1);
  }, 20000);

  it("debits redeemed points exactly once and logs reward_redeemed, not again on redelivery", async () => {
    await admin.from("profiles").update({ rewards_points: 1000 }).eq("id", userId);

    const response = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    const cartId = await cartIdForAuthenticatedUser();
    createdCartIds.push(cartId);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ redeemPoints: 300 }, { token: userToken })
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };
    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);

    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: redemptionRows } = await admin
      .from("rewards_ledger")
      .select("delta_points")
      .eq("order_id", order!.id)
      .eq("reason", "redemption");
    expect(redemptionRows).toHaveLength(1);
    expect(redemptionRows![0]!.delta_points).toBe(-300);

    const { data: activityRows } = await admin
      .from("customer_activity")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "reward_redeemed");
    expect(activityRows).toHaveLength(1);

    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: redemptionRowsAfterRedelivery } = await admin
      .from("rewards_ledger")
      .select("id")
      .eq("order_id", order!.id)
      .eq("reason", "redemption");
    expect(redemptionRowsAfterRedelivery).toHaveLength(1);
  }, 20000);

  it("credits both sides of a referral 500 points exactly once and flips the referral to credited, then does not re-credit on a second order", async () => {
    const referrer = await createUser("referrer-webhook");
    const { data: referrerProfile } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", referrer.id)
      .single();

    const referred = await createUser("referred-webhook", { referral_code: referrerProfile!.referral_code });

    async function checkoutAndComplete() {
      const response = await postCartItem(
        cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: referred.token })
      );
      expect(response.status).toBe(201);
      const { data: cart } = await admin
        .from("carts")
        .select("id")
        .eq("user_id", referred.id)
        .eq("status", "active")
        .single();
      createdCartIds.push(cart!.id);

      const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({}, { token: referred.token }));
      const checkoutBody = await checkoutResponse.json();
      expect(checkoutResponse.status).toBe(201);

      const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
      const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };
      const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);

      const webhookResponse = await postWebhook(webhookRequest(payload, signature));
      expect(webhookResponse.status).toBe(200);

      const { data: order } = await admin
        .from("orders")
        .select("id")
        .eq("stripe_checkout_session_id", checkoutBody.data.id)
        .single();
      createdOrderIds.push(order!.id);
      return order!.id;
    }

    const firstOrderId = await checkoutAndComplete();

    const { data: referrerCredit } = await admin
      .from("rewards_ledger")
      .select("delta_points")
      .eq("user_id", referrer.id)
      .eq("reason", "referral_referrer_credit");
    expect(referrerCredit).toHaveLength(1);
    expect(referrerCredit![0]!.delta_points).toBe(500);

    const { data: referredCredit } = await admin
      .from("rewards_ledger")
      .select("delta_points")
      .eq("user_id", referred.id)
      .eq("reason", "referral_referred_credit")
      .eq("order_id", firstOrderId);
    expect(referredCredit).toHaveLength(1);
    expect(referredCredit![0]!.delta_points).toBe(500);

    const { data: referralRow } = await admin
      .from("referrals")
      .select("status, reward_issued_at")
      .eq("referrer_id", referrer.id)
      .eq("referred_id", referred.id)
      .single();
    expect(referralRow!.status).toBe("credited");
    expect(referralRow!.reward_issued_at).toBeTruthy();

    // Second order from the same referred user - already-credited referral
    // row is no longer 'pending', so the webhook's own guard must skip it.
    await checkoutAndComplete();

    const { data: referrerCreditAfterSecondOrder } = await admin
      .from("rewards_ledger")
      .select("id")
      .eq("user_id", referrer.id)
      .eq("reason", "referral_referrer_credit");
    expect(referrerCreditAfterSecondOrder).toHaveLength(1);

    const { data: referredCreditAfterSecondOrder } = await admin
      .from("rewards_ledger")
      .select("id")
      .eq("user_id", referred.id)
      .eq("reason", "referral_referred_credit");
    expect(referredCreditAfterSecondOrder).toHaveLength(1);
  }, 30000);

  it("skips referral crediting (leaves it pending) when the referrer and referred account share a stripe_customer_id", async () => {
    const referrer = await createUser("referrer-shared");
    const { data: referrerProfile } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", referrer.id)
      .single();

    const referred = await createUser("referred-shared", { referral_code: referrerProfile!.referral_code });

    const sharedCustomerId = `cus_test_shared_${crypto.randomUUID()}`;
    await admin.from("profiles").update({ stripe_customer_id: sharedCustomerId }).eq("id", referrer.id);
    await admin.from("profiles").update({ stripe_customer_id: sharedCustomerId }).eq("id", referred.id);

    const response = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: referred.token })
    );
    expect(response.status).toBe(201);
    const { data: cart } = await admin
      .from("carts")
      .select("id")
      .eq("user_id", referred.id)
      .eq("status", "active")
      .single();
    createdCartIds.push(cart!.id);

    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({}, { token: referred.token }));
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const realSession = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    const completedSession = { ...realSession, payment_intent: `pi_test_${crypto.randomUUID()}` };
    const { payload, signature } = buildSignedEvent("checkout.session.completed", completedSession);

    const webhookResponse = await postWebhook(webhookRequest(payload, signature));
    expect(webhookResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_checkout_session_id", checkoutBody.data.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: referrerCredit } = await admin
      .from("rewards_ledger")
      .select("id")
      .eq("user_id", referrer.id)
      .eq("reason", "referral_referrer_credit");
    expect(referrerCredit).toHaveLength(0);

    const { data: referralRow } = await admin
      .from("referrals")
      .select("status")
      .eq("referrer_id", referrer.id)
      .eq("referred_id", referred.id)
      .single();
    expect(referralRow!.status).toBe("pending");
  }, 20000);
});
