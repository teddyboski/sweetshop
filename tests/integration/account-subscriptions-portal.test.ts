// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postPortalSession } from "@/app/api/account/subscriptions/portal-session/route";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";

// See rls-cross-user.test.ts's header comment: never call a session-mutating
// auth method on the admin client itself - use a separate plain client to
// sign in and obtain a bearer token instead.
const admin = createAdminSupabaseClient();
const stripe = createStripeClient();

let userId: string;
let userToken: string;
let boxId: string;

const createdSubscriptionIds: string[] = [];

const email = `test-portal-${crypto.randomUUID()}@mailinator.com`;
const password = crypto.randomUUID();

beforeAll(async () => {
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

  const { data: box } = await admin.from("boxes").select("id").eq("status", "active").limit(1).single();
  boxId = box!.id;
});

afterAll(async () => {
  // subscriptions.user_id references profiles(id) without cascade
  // (RESTRICT) - must clear before deleting the user, same constraint
  // documented in account-queries.test.ts's teardown.
  for (const subscriptionId of createdSubscriptionIds) {
    await admin.from("subscriptions").delete().eq("id", subscriptionId);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
});

function portalSessionRequest(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/account/subscriptions/portal-session", {
    method: "POST",
    headers,
  });
}

/**
 * Same real-HMAC-signature approach as checkout-webhook-route.test.ts's
 * buildSignedEvent - exercises the actual constructEvent() verification path
 * rather than mocking it away. The subscription payload only needs the
 * fields handleSubscriptionSync actually reads (id, status,
 * items.data[0].current_period_end) - the rest of a real Stripe.Subscription
 * is irrelevant to that handler and to TypeScript at runtime (the route casts
 * via `as Stripe.Subscription`).
 */
function buildSignedSubscriptionEvent(type: string, subscriptionObject: unknown) {
  const payload = JSON.stringify({
    id: `evt_test_${crypto.randomUUID()}`,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object: subscriptionObject },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, signature };
}

function webhookRequest(payload: string, signature: string) {
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

describe("POST /api/account/subscriptions/portal-session", () => {
  it("rejects requests with no bearer token", async () => {
    const response = await postPortalSession(portalSessionRequest());
    expect(response.status).toBe(401);
  });

  it("rejects requests for a user with no stripe_customer_id yet", async () => {
    const response = await postPortalSession(portalSessionRequest(userToken));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.message).toMatch(/billing account/i);
  });
});

describe("customer.subscription.updated / .deleted webhook sync", () => {
  it("updates status and next_delivery_at, and is idempotent on redelivery", async () => {
    const { data: subscription } = await admin
      .from("subscriptions")
      .insert({
        user_id: userId,
        box_id: boxId,
        stripe_subscription_id: `sub_test_sync_${crypto.randomUUID()}`,
        status: "active",
      })
      .select("id, stripe_subscription_id")
      .single();
    createdSubscriptionIds.push(subscription!.id);

    const periodEndSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const fakeSubscription = {
      id: subscription!.stripe_subscription_id,
      object: "subscription",
      status: "paused",
      items: { object: "list", data: [{ id: "si_test", object: "subscription_item", current_period_end: periodEndSeconds }] },
    };

    const { payload, signature } = buildSignedSubscriptionEvent("customer.subscription.updated", fakeSubscription);
    const firstResponse = await postWebhook(webhookRequest(payload, signature));
    expect(firstResponse.status).toBe(200);

    const { data: afterFirst } = await admin
      .from("subscriptions")
      .select("status, next_delivery_at")
      .eq("id", subscription!.id)
      .single();
    expect(afterFirst!.status).toBe("paused");
    expect(new Date(afterFirst!.next_delivery_at!).getTime()).toBe(periodEndSeconds * 1000);

    // Redelivery: Stripe retries if it doesn't see a fast 2xx. This is a pure
    // state-mirroring UPDATE, so applying the same event twice must converge
    // on the same row, not create a duplicate or a different result.
    const secondResponse = await postWebhook(webhookRequest(payload, signature));
    expect(secondResponse.status).toBe(200);

    const { data: matchingRows } = await admin
      .from("subscriptions")
      .select("id, status")
      .eq("stripe_subscription_id", subscription!.stripe_subscription_id!);
    expect(matchingRows).toHaveLength(1);
    expect(matchingRows![0]!.status).toBe("paused");
  });

  it("maps customer.subscription.deleted to status 'cancelled'", async () => {
    const { data: subscription } = await admin
      .from("subscriptions")
      .insert({
        user_id: userId,
        box_id: boxId,
        stripe_subscription_id: `sub_test_delete_${crypto.randomUUID()}`,
        status: "active",
      })
      .select("id, stripe_subscription_id")
      .single();
    createdSubscriptionIds.push(subscription!.id);

    const fakeSubscription = {
      id: subscription!.stripe_subscription_id,
      object: "subscription",
      status: "canceled",
      items: { object: "list", data: [] },
    };

    const { payload, signature } = buildSignedSubscriptionEvent("customer.subscription.deleted", fakeSubscription);
    const response = await postWebhook(webhookRequest(payload, signature));
    expect(response.status).toBe(200);

    const { data: after } = await admin
      .from("subscriptions")
      .select("status, next_delivery_at")
      .eq("id", subscription!.id)
      .single();
    expect(after!.status).toBe("cancelled");
    expect(after!.next_delivery_at).toBeNull();
  });

  it("returns 200 without throwing for a subscription id with no matching local row", async () => {
    const fakeSubscription = {
      id: `sub_test_unknown_${crypto.randomUUID()}`,
      object: "subscription",
      status: "active",
      items: { object: "list", data: [] },
    };

    const { payload, signature } = buildSignedSubscriptionEvent("customer.subscription.updated", fakeSubscription);
    const response = await postWebhook(webhookRequest(payload, signature));
    expect(response.status).toBe(200);
  });
});
