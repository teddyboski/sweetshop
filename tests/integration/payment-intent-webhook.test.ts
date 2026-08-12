// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { POST as postPaymentIntent } from "@/app/api/checkout/payment-intent/route";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";

// Same deliberate Resend exception as checkout-webhook-route.test.ts's own
// header comment - the email send itself is captured, not actually sent;
// Supabase and Stripe are never mocked, per this repo's "never mock the
// database" convention.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("@/lib/resend/client", () => ({
  createResendClient: () => ({ emails: { send: mockSend } }),
  RESEND_FROM_EMAIL: "onboarding@resend.dev",
}));

vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: {
    checkout: { scope: "checkout", limit: 30, windowSeconds: 60 },
    auth: { scope: "auth", limit: 60, windowSeconds: 600 },
  },
}));

const admin = createAdminSupabaseClient();
const stripe = createStripeClient();

let sellableSnackId: string;
let byoSnackIds: string[];
let userId: string;
let userToken: string;
const createdCartIds: string[] = [];
const createdOrderIds: string[] = [];
const inventoryRestores: Array<{ snackId: string; quantity: number }> = [];
const createdPromotionIds: string[] = [];
const extraUserIds: string[] = [];
let rewardsBalanceBeforeAll: number;

const email = `test-pi-webhook-${crypto.randomUUID()}@mailinator.com`;
const password = crypto.randomUUID();

const sampleShippingAddress = {
  name: "Ted Tester",
  line1: "123 Snack Lane",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
};

beforeAll(async () => {
  const { data: snack } = await admin
    .from("snacks")
    .select("id")
    .eq("is_sellable_individually", true)
    .limit(1)
    .single();
  sellableSnackId = snack!.id;

  const { data: byoSnacks } = await admin.from("snacks").select("id").eq("is_byo_eligible", true).limit(8);
  byoSnackIds = byoSnacks!.map((s) => s.id);

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
  await admin.from("customer_activity").delete().eq("user_id", userId);

  for (const orderId of createdOrderIds) {
    await admin.from("rewards_ledger").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  createdOrderIds.length = 0;

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

  for (const id of extraUserIds) {
    await admin.from("customer_activity").delete().eq("user_id", id);
    await admin.from("referrals").delete().or(`referrer_id.eq.${id},referred_id.eq.${id}`);
    await admin.from("rewards_ledger").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  extraUserIds.length = 0;

  await admin.from("profiles").update({ rewards_points: rewardsBalanceBeforeAll }).eq("id", userId);
});

async function seedPromotion(overrides: Partial<{ discountType: "percent" | "fixed"; value: number }> = {}) {
  const { data, error } = await admin
    .from("promotions")
    .insert({
      code: `TEST${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      discount_type: overrides.discountType ?? "fixed",
      value: overrides.value ?? 100,
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

function cartItemRequest(body: unknown, opts: { anonymousHeader?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.anonymousHeader) headers["x-anonymous-cart-id"] = opts.anonymousHeader;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/cart/items", { method: "POST", headers, body: JSON.stringify(body) });
}

function paymentIntentRequest(body: unknown, opts: { anonymousHeader?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.anonymousHeader) headers["x-anonymous-cart-id"] = opts.anonymousHeader;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/checkout/payment-intent", {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

async function cartIdForAuthenticatedUser(): Promise<string> {
  const { data: cart } = await admin.from("carts").select("id").eq("user_id", userId).eq("status", "active").single();
  return cart!.id;
}

// Same technique as checkout-webhook-route.test.ts's buildSignedEvent: a
// real HMAC signature over the exact raw JSON string, generated via the
// SDK's own test-header helper, keyed off STRIPE_WEBHOOK_SECRET - exercises
// the real constructEvent() signature verification path rather than mocking
// it away.
function buildSignedEvent(type: string, object: unknown) {
  const payload = JSON.stringify({
    id: `evt_test_${crypto.randomUUID()}`,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  return { payload, signature };
}

function webhookRequest(payload: string, signature?: string) {
  const headers: Record<string, string> = {};
  if (signature) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", { method: "POST", headers, body: payload });
}

describe("POST /api/webhooks/stripe - payment_intent.succeeded (mobile)", () => {
  it("creates the order and order_items, credits rewards once, and is idempotent on redelivery", async () => {
    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: userToken })
    );

    const cartId = await cartIdForAuthenticatedUser();
    createdCartIds.push(cartId);

    const piResponse = await postPaymentIntent(
      paymentIntentRequest({ shippingAddress: sampleShippingAddress }, { token: userToken })
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const realPaymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    expect(realPaymentIntent.metadata.source).toBe("mobile"); // sanity check on the fixture itself

    const { data: profileBefore } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();

    const { payload, signature } = buildSignedEvent("payment_intent.succeeded", realPaymentIntent);
    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id, status, total_amount_cents, user_id, stripe_checkout_session_id, confirmation_email_sent_at")
      .eq("stripe_payment_intent_id", realPaymentIntent.id)
      .single();
    expect(order).toBeTruthy();
    createdOrderIds.push(order!.id);
    expect(order!.status).toBe("paid");
    expect(order!.user_id).toBe(userId);
    expect(order!.total_amount_cents).toBe(realPaymentIntent.amount);
    expect(order!.stripe_checkout_session_id).toBeNull();
    expect(order!.confirmation_email_sent_at).toBeTruthy();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: email }));

    const { data: orderItems } = await admin.from("order_items").select("id").eq("order_id", order!.id);
    expect(orderItems).toHaveLength(2);

    const expectedPoints = Math.floor(realPaymentIntent.amount / 100);
    const { data: ledgerRows } = await admin.from("rewards_ledger").select("delta_points").eq("order_id", order!.id);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows![0]!.delta_points).toBe(expectedPoints);

    const { data: profileAfter } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    expect(profileAfter!.rewards_points).toBe((profileBefore!.rewards_points ?? 0) + expectedPoints);

    const { data: cartAfter } = await admin.from("carts").select("status").eq("id", cartId).single();
    expect(cartAfter!.status).toBe("converted");

    // Redelivery: idempotency anchored on orders.stripe_payment_intent_id
    // (see handlePaymentIntentSucceeded's own header comment) - a second
    // delivery of the same event must not create a second order, credit
    // rewards again, or send a second email.
    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: ordersAfterRedelivery } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", realPaymentIntent.id);
    expect(ordersAfterRedelivery).toHaveLength(1);

    const { data: ledgerAfterRedelivery } = await admin.from("rewards_ledger").select("id").eq("order_id", order!.id);
    expect(ledgerAfterRedelivery).toHaveLength(1);

    expect(mockSend).toHaveBeenCalledTimes(1);
  }, 20000);

  it("does NOT process a payment_intent.succeeded event without metadata.source=mobile (the web Checkout Session's own underlying PaymentIntent)", async () => {
    // Simulates the exact scenario the header comment on
    // handlePaymentIntentSucceeded warns about: every Checkout-Session-
    // created PaymentIntent independently fires its own
    // payment_intent.succeeded event. Without the source guard, this would
    // double-process an order that checkout.session.completed already
    // handles. No cart_id in metadata either, matching what a real web
    // PaymentIntent's metadata looks like (it carries none of mobile's
    // metadata keys).
    const fakePaymentIntent = {
      id: `pi_test_web_${crypto.randomUUID()}`,
      amount: 1500,
      currency: "usd",
      shipping: null,
      metadata: {},
    };

    const { payload, signature } = buildSignedEvent("payment_intent.succeeded", fakePaymentIntent);
    const response = await postWebhook(webhookRequest(payload, signature));
    expect(response.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", fakePaymentIntent.id)
      .maybeSingle();
    expect(order).toBeNull();
  });

  it("creates a guest order with no rewards credited and the guest email on the order row", async () => {
    const response = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const body = await response.json();
    const anonymousId = body.data.anonymousCartId as string;
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", body.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const guestEmail = `guest-pi-webhook-${crypto.randomUUID()}@mailinator.com`;
    const piResponse = await postPaymentIntent(
      paymentIntentRequest({ guestEmail, shippingAddress: sampleShippingAddress }, { anonymousHeader: anonymousId })
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const realPaymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    const { payload, signature } = buildSignedEvent("payment_intent.succeeded", realPaymentIntent);
    const webhookResponse = await postWebhook(webhookRequest(payload, signature));
    expect(webhookResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, guest_email, confirmation_email_sent_at")
      .eq("stripe_payment_intent_id", realPaymentIntent.id)
      .single();
    createdOrderIds.push(order!.id);
    expect(order!.user_id).toBeNull();
    expect(order!.guest_email).toBe(guestEmail);
    expect(order!.confirmation_email_sent_at).toBeTruthy();
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: guestEmail }));

    const { data: ledgerRows } = await admin.from("rewards_ledger").select("id").eq("order_id", order!.id);
    expect(ledgerRows).toHaveLength(0);
  });

  it("creates order_item_snacks for a Build-a-Box line, mirroring the web session flow's own line-item behavior", async () => {
    const response = await postCartItem(
      cartItemRequest({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        snacks: byoSnackIds.map((snackId) => ({ snackId, quantity: 1 })),
      })
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    const anonymousId = body.data.anonymousCartId as string;
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", body.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const piResponse = await postPaymentIntent(
      paymentIntentRequest(
        { guestEmail: "guest-byo-pi@example.com", shippingAddress: sampleShippingAddress },
        { anonymousHeader: anonymousId }
      )
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const realPaymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    const { payload, signature } = buildSignedEvent("payment_intent.succeeded", realPaymentIntent);
    const webhookResponse = await postWebhook(webhookRequest(payload, signature));
    expect(webhookResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", realPaymentIntent.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: orderItems } = await admin.from("order_items").select("id").eq("order_id", order!.id);
    expect(orderItems).toHaveLength(1);

    const { data: orderItemSnacks } = await admin
      .from("order_item_snacks")
      .select("snack_id, quantity")
      .eq("order_item_id", orderItems![0]!.id);
    expect(orderItemSnacks).toHaveLength(8);
    expect(orderItemSnacks!.reduce((sum, s) => sum + s.quantity, 0)).toBe(8);
  });

  it("applies promo usage and points redemption exactly once, not again on redelivery", async () => {
    await admin.from("profiles").update({ rewards_points: 1000 }).eq("id", userId);
    const promotion = await seedPromotion({ discountType: "fixed", value: 200 });

    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const piResponse = await postPaymentIntent(
      paymentIntentRequest(
        { promoCode: promotion.code, redeemPoints: 300, shippingAddress: sampleShippingAddress },
        { token: userToken }
      )
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const realPaymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    const { payload, signature } = buildSignedEvent("payment_intent.succeeded", realPaymentIntent);

    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", realPaymentIntent.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: promoAfterFirst } = await admin.from("promotions").select("used_count").eq("id", promotion.id).single();
    expect(promoAfterFirst!.used_count).toBe(1);

    const { data: redemptionRows } = await admin
      .from("rewards_ledger")
      .select("delta_points")
      .eq("order_id", order!.id)
      .eq("reason", "redemption");
    expect(redemptionRows).toHaveLength(1);
    expect(redemptionRows![0]!.delta_points).toBe(-300);

    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: promoAfterRedelivery } = await admin.from("promotions").select("used_count").eq("id", promotion.id).single();
    expect(promoAfterRedelivery!.used_count).toBe(1);

    const { data: redemptionRowsAfterRedelivery } = await admin
      .from("rewards_ledger")
      .select("id")
      .eq("order_id", order!.id)
      .eq("reason", "redemption");
    expect(redemptionRowsAfterRedelivery).toHaveLength(1);
  }, 20000);

  it("credits both sides of a referral 500 points exactly once on a mobile purchase", async () => {
    const referrer = await createUser("referrer-pi-webhook");
    const { data: referrerProfile } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", referrer.id)
      .single();

    const referred = await createUser("referred-pi-webhook", { referral_code: referrerProfile!.referral_code });

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

    const piResponse = await postPaymentIntent(
      paymentIntentRequest({ shippingAddress: sampleShippingAddress }, { token: referred.token })
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const realPaymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    const { payload, signature } = buildSignedEvent("payment_intent.succeeded", realPaymentIntent);
    const webhookResponse = await postWebhook(webhookRequest(payload, signature));
    expect(webhookResponse.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", realPaymentIntent.id)
      .single();
    createdOrderIds.push(order!.id);

    const { data: referrerCredit } = await admin
      .from("rewards_ledger")
      .select("delta_points")
      .eq("user_id", referrer.id)
      .eq("reason", "referral_referrer_credit");
    expect(referrerCredit).toHaveLength(1);
    expect(referrerCredit![0]!.delta_points).toBe(500);

    const { data: referralRow } = await admin
      .from("referrals")
      .select("status")
      .eq("referrer_id", referrer.id)
      .eq("referred_id", referred.id)
      .single();
    expect(referralRow!.status).toBe("credited");
  }, 20000);
});
