// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { GET as getOrders } from "@/app/api/account/orders/route";
import { GET as getOrderDetail } from "@/app/api/account/orders/[id]/route";
import { GET as getSubscriptions } from "@/app/api/account/subscriptions/route";
import { GET as getRewards } from "@/app/api/account/rewards/route";
import { GET as getReferrals } from "@/app/api/account/referrals/route";

// Milestone 10: mocked the same way every other route test file does - this
// suite exercises five routes many times in-process from the same
// "local-dev" IP key.
vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: { catalog: { scope: "catalog", limit: 300, windowSeconds: 60 } },
}));

/**
 * Milestone 14 (mobile): these five Route Handlers are thin wrappers around
 * queries/account.ts, already covered at the query level by
 * account-queries.test.ts - this file's job is the Route Handler layer
 * itself (auth gating, ownership → 404 translation, response shape), not
 * re-proving the underlying query logic.
 */

const admin = createAdminSupabaseClient();

let userAId: string;
let userAToken: string;
let userBId: string;
let userBToken: string;
let boxId: string;

let orderAId: string;
let orderBId: string;

const createdOrderIds: string[] = [];
const createdSubscriptionIds: string[] = [];
const createdReferralIds: string[] = [];

const emailA = `test-account-routes-a-${crypto.randomUUID()}@mailinator.com`;
const passwordA = crypto.randomUUID();
const emailB = `test-account-routes-b-${crypto.randomUUID()}@mailinator.com`;
const passwordB = crypto.randomUUID();

async function signIn(email: string, password: string): Promise<string> {
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data, error } = await anonAuthClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error;
  return data.session.access_token;
}

beforeAll(async () => {
  const { data: userA, error: errorA } = await admin.auth.admin.createUser({
    email: emailA,
    password: passwordA,
    email_confirm: true,
  });
  if (errorA || !userA.user) throw errorA;
  userAId = userA.user.id;
  userAToken = await signIn(emailA, passwordA);

  const { data: userB, error: errorB } = await admin.auth.admin.createUser({
    email: emailB,
    password: passwordB,
    email_confirm: true,
  });
  if (errorB || !userB.user) throw errorB;
  userBId = userB.user.id;
  userBToken = await signIn(emailB, passwordB);

  const { data: box } = await admin.from("boxes").select("id").eq("status", "active").limit(1).single();
  boxId = box!.id;

  const { data: orderA } = await admin
    .from("orders")
    .insert({ user_id: userAId, status: "paid", total_amount_cents: 1500, shipping_address: null })
    .select("id")
    .single();
  orderAId = orderA!.id;
  createdOrderIds.push(orderAId);
  await admin
    .from("order_items")
    .insert({ order_id: orderAId, item_type: "box", box_id: boxId, quantity: 1, unit_price_cents: 1500 });

  const { data: orderB } = await admin
    .from("orders")
    .insert({ user_id: userBId, status: "paid", total_amount_cents: 2000, shipping_address: null })
    .select("id")
    .single();
  orderBId = orderB!.id;
  createdOrderIds.push(orderBId);
  await admin
    .from("order_items")
    .insert({ order_id: orderBId, item_type: "box", box_id: boxId, quantity: 1, unit_price_cents: 2000 });

  const { data: subA } = await admin
    .from("subscriptions")
    .insert({
      user_id: userAId,
      box_id: boxId,
      stripe_subscription_id: `sub_test_routes_a_${crypto.randomUUID()}`,
      status: "active",
    })
    .select("id")
    .single();
  createdSubscriptionIds.push(subA!.id);

  await admin.from("rewards_ledger").insert({ user_id: userAId, delta_points: 150, reason: "order_placed", order_id: orderAId });
  await admin.from("rewards_ledger").insert({ user_id: userBId, delta_points: 200, reason: "order_placed", order_id: orderBId });
  await admin.from("profiles").update({ rewards_points: 150 }).eq("id", userAId);
  await admin.from("profiles").update({ rewards_points: 200 }).eq("id", userBId);

  const { data: referralA } = await admin
    .from("referrals")
    .insert({ referrer_id: userAId, referred_id: userBId, status: "pending" })
    .select("id")
    .single();
  createdReferralIds.push(referralA!.id);
});

afterAll(async () => {
  await admin.from("rewards_ledger").delete().in("order_id", createdOrderIds);
  await admin.from("rewards_ledger").delete().eq("user_id", userAId);
  await admin.from("rewards_ledger").delete().eq("user_id", userBId);
  for (const id of createdReferralIds) await admin.from("referrals").delete().eq("id", id);
  for (const id of createdSubscriptionIds) await admin.from("subscriptions").delete().eq("id", id);
  for (const id of createdOrderIds) await admin.from("orders").delete().eq("id", id);
  await admin.auth.admin.deleteUser(userAId);
  await admin.auth.admin.deleteUser(userBId);
});

function authedRequest(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost:3000${path}`, { method: "GET", headers });
}

describe("GET /api/account/orders", () => {
  it("returns only the authenticated user's orders", async () => {
    const response = await getOrders(authedRequest("/api/account/orders", userAToken));
    const body = await response.json();
    expect(response.status).toBe(200);
    const ids: string[] = body.data.map((o: { id: string }) => o.id);
    expect(ids).toContain(orderAId);
    expect(ids).not.toContain(orderBId);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await getOrders(authedRequest("/api/account/orders"));
    expect(response.status).toBe(401);
  });
});

describe("GET /api/account/orders/[id]", () => {
  function makeRequest(id: string, token?: string) {
    return getOrderDetail(authedRequest(`/api/account/orders/${id}`, token), { params: Promise.resolve({ id }) });
  }

  it("returns the order's own detail, including line items", async () => {
    const response = await makeRequest(orderAId, userAToken);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.id).toBe(orderAId);
    expect(body.data.items).toHaveLength(1);
  });

  it("returns 404, not another user's data, for an order id belonging to someone else", async () => {
    const response = await makeRequest(orderBId, userAToken);
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.data).toBeNull();
  });

  it("returns 404 for a nonexistent order id", async () => {
    const response = await makeRequest(crypto.randomUUID(), userAToken);
    expect(response.status).toBe(404);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await makeRequest(orderAId);
    expect(response.status).toBe(401);
  });
});

describe("GET /api/account/subscriptions", () => {
  it("returns only the authenticated user's subscriptions", async () => {
    const responseA = await getSubscriptions(authedRequest("/api/account/subscriptions", userAToken));
    const bodyA = await responseA.json();
    expect(responseA.status).toBe(200);
    expect(bodyA.data).toHaveLength(1);
    expect(bodyA.data[0].id).toBe(createdSubscriptionIds[0]);

    const responseB = await getSubscriptions(authedRequest("/api/account/subscriptions", userBToken));
    const bodyB = await responseB.json();
    expect(bodyB.data).toHaveLength(0);
  });
});

describe("GET /api/account/rewards", () => {
  it("returns the caller's cached balance and their own ledger only", async () => {
    const response = await getRewards(authedRequest("/api/account/rewards", userAToken));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.balance).toBe(150);
    expect(body.data.ledger).toHaveLength(1);
    expect(body.data.ledger[0].deltaPoints).toBe(150);
  });
});

describe("GET /api/account/referrals", () => {
  it("returns the caller's own referral code, a correctly-built link, and their referrals list", async () => {
    const response = await getReferrals(authedRequest("/api/account/referrals", userAToken));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(typeof body.data.referralCode).toBe("string");
    expect(body.data.referralLink).toBe(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/signup?ref=${body.data.referralCode}`);
    expect(body.data.referrals).toHaveLength(1);
    expect(body.data.referrals[0].status).toBe("pending");
  });

  it("returns an empty referrals list for a user who hasn't referred anyone", async () => {
    const response = await getReferrals(authedRequest("/api/account/referrals", userBToken));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.referrals).toHaveLength(0);
  });
});
