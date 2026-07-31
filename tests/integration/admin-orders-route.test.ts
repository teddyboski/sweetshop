// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { PATCH as patchOrder } from "@/app/api/admin/orders/[id]/route";
import { POST as postRefund } from "@/app/api/admin/orders/[id]/refund/route";

const admin = createAdminSupabaseClient();
const stripe = createStripeClient();

let adminUserId: string;
let adminToken: string;
let customerUserId: string;
let customerToken: string;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-orders-${crypto.randomUUID()}@mailinator.com`;
  const { data: adminUser, error: adminError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  if (adminError || !adminUser.user) throw adminError;
  adminUserId = adminUser.user.id;
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminUserId);
  const { data: adminSession } = await anonAuthClient.auth.signInWithPassword({ email: adminEmail, password });
  adminToken = adminSession!.session!.access_token;

  const customerEmail = `test-customer-orders-${crypto.randomUUID()}@mailinator.com`;
  const { data: customerUser, error: customerError } = await admin.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
  });
  if (customerError || !customerUser.user) throw customerError;
  customerUserId = customerUser.user.id;
  const { data: customerSession } = await anonAuthClient.auth.signInWithPassword({ email: customerEmail, password });
  customerToken = customerSession!.session!.access_token;
});

afterAll(async () => {
  for (const id of createdOrderIds) {
    await admin.from("orders").delete().eq("id", id);
  }
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (customerUserId) await admin.auth.admin.deleteUser(customerUserId);
});

async function seedOrder(overrides: Partial<Database["public"]["Tables"]["orders"]["Insert"]> = {}) {
  const { data, error } = await admin
    .from("orders")
    .insert({
      user_id: customerUserId,
      status: "paid",
      total_amount_cents: 1999,
      ...overrides,
    })
    .select("id, status, tracking_number, stripe_payment_intent_id")
    .single();
  if (error || !data) throw error;
  createdOrderIds.push(data.id);
  return data;
}

function request(url: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

describe("PATCH /api/admin/orders/[id]", () => {
  it("marks a paid order fulfilled with a tracking number and writes an audit log", async () => {
    const order = await seedOrder({ status: "paid" });

    const response = await patchOrder(
      request(`http://localhost:3000/api/admin/orders/${order.id}`, "PATCH", {
        status: "fulfilled",
        trackingNumber: "1Z999AA10123456784",
      }, adminToken),
      { params: Promise.resolve({ id: order.id }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.status).toBe("fulfilled");
    expect(body.data.tracking_number).toBe("1Z999AA10123456784");

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", order.id)
      .eq("action", "order_update");
    expect(logs!.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects marking an order fulfilled with no tracking number with 400", async () => {
    const order = await seedOrder({ status: "paid" });

    const response = await patchOrder(
      request(`http://localhost:3000/api/admin/orders/${order.id}`, "PATCH", { status: "fulfilled" }, adminToken),
      { params: Promise.resolve({ id: order.id }) }
    );
    expect(response.status).toBe(400);
  });

  it("rejects a non-admin with 403", async () => {
    const order = await seedOrder({ status: "paid" });

    const response = await patchOrder(
      request(
        `http://localhost:3000/api/admin/orders/${order.id}`,
        "PATCH",
        { status: "fulfilled", trackingNumber: "TRACK123" },
        customerToken
      ),
      { params: Promise.resolve({ id: order.id }) }
    );
    expect(response.status).toBe(403);
  });
});

describe("POST /api/admin/orders/[id]/refund", () => {
  it("rejects a refund with 400 when the order has no stripe_payment_intent_id, without calling Stripe", async () => {
    const order = await seedOrder({ status: "paid", stripe_payment_intent_id: null });

    const response = await postRefund(
      request(`http://localhost:3000/api/admin/orders/${order.id}/refund`, "POST", undefined, adminToken),
      { params: Promise.resolve({ id: order.id }) }
    );
    expect(response.status).toBe(400);

    const { data: unchanged } = await admin.from("orders").select("status").eq("id", order.id).single();
    expect(unchanged!.status).toBe("paid");
  });

  it("refunds a real Stripe payment intent, sets status to refunded, and writes an audit log", async () => {
    // A genuine PaymentIntent, confirmed server-side with Stripe's built-in
    // test payment method - no hosted Checkout page to drive here, so this
    // is the closest equivalent to a "real card ran through checkout" that's
    // reachable from a Vitest run, and it lets the refund route call the
    // real stripe.refunds.create API rather than mocking it (consistent with
    // this repo's "never mock Stripe" convention - see
    // checkout-webhook-route.test.ts's header comment).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1999,
      currency: "usd",
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });
    expect(paymentIntent.status).toBe("succeeded");

    const order = await seedOrder({ status: "paid", stripe_payment_intent_id: paymentIntent.id, total_amount_cents: 1999 });

    const response = await postRefund(
      request(`http://localhost:3000/api/admin/orders/${order.id}/refund`, "POST", undefined, adminToken),
      { params: Promise.resolve({ id: order.id }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.status).toBe("refunded");

    const refunds = await stripe.refunds.list({ payment_intent: paymentIntent.id });
    expect(refunds.data).toHaveLength(1);
    expect(refunds.data[0]!.status).toBe("succeeded");

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", order.id)
      .eq("action", "order_refund");
    expect(logs!.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("rejects refunding an already-refunded order with 400", async () => {
    const order = await seedOrder({ status: "refunded", stripe_payment_intent_id: `pi_test_${crypto.randomUUID()}` });

    const response = await postRefund(
      request(`http://localhost:3000/api/admin/orders/${order.id}/refund`, "POST", undefined, adminToken),
      { params: Promise.resolve({ id: order.id }) }
    );
    expect(response.status).toBe(400);
  });

  it("rejects a non-admin with 403", async () => {
    const order = await seedOrder({ status: "paid", stripe_payment_intent_id: `pi_test_${crypto.randomUUID()}` });

    const response = await postRefund(
      request(`http://localhost:3000/api/admin/orders/${order.id}/refund`, "POST", undefined, customerToken),
      { params: Promise.resolve({ id: order.id }) }
    );
    expect(response.status).toBe(403);
  });
});
