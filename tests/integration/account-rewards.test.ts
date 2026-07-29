// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { POST as postCheckoutSession } from "@/app/api/checkout/session/route";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";
import { getRewardsBalance, getRewardsLedger } from "@/lib/supabase/queries/account";

// Milestone 6's own webhook test documents why Resend is mocked here (a
// deliberate, plan-approved exception) while Supabase and Stripe still hit
// the real APIs - see checkout-webhook-route.test.ts's header comment.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("@/lib/resend/client", () => ({
  createResendClient: () => ({ emails: { send: mockSend } }),
  RESEND_FROM_EMAIL: "onboarding@resend.dev",
}));

const admin = createAdminSupabaseClient();
const stripe = createStripeClient();

let sellableSnackId: string;
let userId: string;
let userToken: string;
const createdCartIds: string[] = [];
const createdOrderIds: string[] = [];

const email = `test-account-rewards-${crypto.randomUUID()}@mailinator.com`;
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

  mockSend.mockResolvedValue({ data: { id: `email_test_${crypto.randomUUID()}` }, error: null });
});

afterAll(async () => {
  // Same FK order as checkout-webhook-route.test.ts's teardown:
  // rewards_ledger.order_id has no cascade, must clear before the order.
  for (const orderId of createdOrderIds) {
    await admin.from("rewards_ledger").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
});

function cartItemRequest(body: unknown, token: string) {
  return new NextRequest("http://localhost:3000/api/cart/items", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function checkoutSessionRequest(token: string) {
  return new NextRequest("http://localhost:3000/api/checkout/session", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
}

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

describe("account rewards balance & history", () => {
  it("getRewardsLedger matches exactly what the checkout webhook credited, and getRewardsBalance matches the cached profiles.rewards_points value", async () => {
    const cartResponse = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, userToken)
    );
    expect(cartResponse.status).toBe(201);

    const { data: cart } = await admin.from("carts").select("id").eq("user_id", userId).eq("status", "active").single();
    createdCartIds.push(cart!.id);

    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest(userToken));
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

    const { data: creditedLedgerRows } = await admin
      .from("rewards_ledger")
      .select("id, delta_points, reason, order_id, created_at")
      .eq("order_id", order!.id);
    expect(creditedLedgerRows).toHaveLength(1);

    const ledger = await getRewardsLedger(userId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.id).toBe(creditedLedgerRows![0]!.id);
    expect(ledger[0]!.deltaPoints).toBe(creditedLedgerRows![0]!.delta_points);
    expect(ledger[0]!.reason).toBe(creditedLedgerRows![0]!.reason);
    expect(ledger[0]!.orderId).toBe(order!.id);

    const { data: profile } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    const balance = await getRewardsBalance(userId);
    expect(balance).toBe(profile!.rewards_points);
    expect(balance).toBe(ledger[0]!.deltaPoints);
  }, 20000);
});
