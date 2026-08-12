// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { GET as getOrderByPaymentIntent } from "@/app/api/orders/by-payment-intent/[paymentIntentId]/route";

vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: { checkout: { scope: "checkout", limit: 30, windowSeconds: 60 } },
}));

const admin = createAdminSupabaseClient();

let sellableSnackId: string;
let sellableSnackPriceCents: number;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const { data: snack } = await admin
    .from("snacks")
    .select("id, price_cents")
    .eq("is_sellable_individually", true)
    .limit(1)
    .single();
  sellableSnackId = snack!.id;
  sellableSnackPriceCents = snack!.price_cents!;
});

afterEach(async () => {
  for (const orderId of createdOrderIds) {
    await admin.from("orders").delete().eq("id", orderId);
  }
  createdOrderIds.length = 0;
});

function makeRequest(paymentIntentId: string) {
  const request = new NextRequest(`http://localhost:3000/api/orders/by-payment-intent/${paymentIntentId}`, {
    method: "GET",
  });
  return getOrderByPaymentIntent(request, { params: Promise.resolve({ paymentIntentId }) });
}

describe("GET /api/orders/by-payment-intent/[paymentIntentId]", () => {
  it("rejects an id that doesn't look like a Stripe PaymentIntent id with 400", async () => {
    const response = await makeRequest("not-a-payment-intent-id");
    expect(response.status).toBe(400);
  });

  it("returns status 'pending' and a null order when the webhook hasn't created the order yet", async () => {
    const response = await makeRequest(`pi_test_${crypto.randomUUID()}`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.status).toBe("pending");
    expect(body.data.order).toBeNull();
  });

  it("returns status 'ready' with the order's line items and total once the order row exists, with no auth required (mirrors the web checkout success page's own trust model)", async () => {
    const paymentIntentId = `pi_test_${crypto.randomUUID()}`;

    const { data: order, error } = await admin
      .from("orders")
      .insert({
        stripe_payment_intent_id: paymentIntentId,
        status: "paid",
        total_amount_cents: sellableSnackPriceCents * 2,
        guest_email: "guest-confirmation@example.com",
      })
      .select("id")
      .single();
    if (error || !order) throw error;
    createdOrderIds.push(order.id);

    await admin.from("order_items").insert({
      order_id: order.id,
      item_type: "snack",
      snack_id: sellableSnackId,
      quantity: 2,
      unit_price_cents: sellableSnackPriceCents,
    });

    const response = await makeRequest(paymentIntentId);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ready");
    expect(body.data.order.id).toBe(order.id);
    expect(body.data.order.totalAmountCents).toBe(sellableSnackPriceCents * 2);
    expect(body.data.order.items).toHaveLength(1);
    expect(body.data.order.items[0].quantity).toBe(2);
  });

  it("does not return a soft-deleted order (deleted_at is not null)", async () => {
    const paymentIntentId = `pi_test_${crypto.randomUUID()}`;

    const { data: order, error } = await admin
      .from("orders")
      .insert({
        stripe_payment_intent_id: paymentIntentId,
        status: "paid",
        total_amount_cents: 1000,
        guest_email: "guest-deleted@example.com",
        deleted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !order) throw error;
    createdOrderIds.push(order.id);

    const response = await makeRequest(paymentIntentId);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.status).toBe("pending");
    expect(body.data.order).toBeNull();
  });
});
