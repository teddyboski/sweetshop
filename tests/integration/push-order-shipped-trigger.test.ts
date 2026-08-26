// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PATCH as patchOrder } from "@/app/api/admin/orders/[id]/route";

// Same deliberate exception as Resend in the checkout webhook tests -
// external delivery services are mocked/captured, Supabase never is. See
// src/lib/push/send.ts's own header comment for why a failed send must
// never throw regardless.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/push/send", () => ({ sendExpoPushNotifications: mockSend }));

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerUserId: string;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-push-shipped-admin-${crypto.randomUUID()}@mailinator.com`;
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

  const customerEmail = `test-push-shipped-customer-${crypto.randomUUID()}@mailinator.com`;
  const { data: customerUser, error: customerError } = await admin.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
  });
  if (customerError || !customerUser.user) throw customerError;
  customerUserId = customerUser.user.id;
});

afterAll(async () => {
  await admin.from("push_tokens").delete().eq("user_id", customerUserId);
  for (const id of createdOrderIds) await admin.from("orders").delete().eq("id", id);
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (customerUserId) await admin.auth.admin.deleteUser(customerUserId);
});

beforeEach(() => {
  mockSend.mockClear();
});

async function seedOrder(overrides: Partial<Database["public"]["Tables"]["orders"]["Insert"]> = {}) {
  const { data, error } = await admin
    .from("orders")
    .insert({ user_id: customerUserId, status: "paid", total_amount_cents: 1500, ...overrides })
    .select("id, status")
    .single();
  if (error || !data) throw error;
  createdOrderIds.push(data.id);
  return data;
}

function request(id: string, body: unknown) {
  return patchOrder(
    new NextRequest(`http://localhost:3000/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe("PATCH /api/admin/orders/[id] - order-shipped push trigger (Milestone 14)", () => {
  it("sends exactly one push, to every registered token, when an order transitions to shipped", async () => {
    const tokenA = `ExponentPushToken[test-shipped-a-${crypto.randomUUID()}]`;
    const tokenB = `ExponentPushToken[test-shipped-b-${crypto.randomUUID()}]`;
    await admin.from("push_tokens").insert([
      { expo_push_token: tokenA, user_id: customerUserId, platform: "ios" },
      { expo_push_token: tokenB, user_id: customerUserId, platform: "android" },
    ]);

    const order = await seedOrder({ status: "fulfilled" });
    const response = await request(order.id, { status: "shipped" });
    expect(response.status).toBe(200);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentMessages = mockSend.mock.calls[0][0];
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages.map((m: { to: string }) => m.to).sort()).toEqual([tokenA, tokenB].sort());
    expect(sentMessages[0].data).toEqual({ type: "order_shipped", orderId: order.id });

    await admin.from("push_tokens").delete().in("expo_push_token", [tokenA, tokenB]);
  });

  it("does not send again when the order is already shipped and gets PATCHed again (e.g. a tracking number correction)", async () => {
    const order = await seedOrder({ status: "shipped" });
    const response = await request(order.id, { status: "shipped", trackingNumber: "1Z999AA10123456784" });
    expect(response.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not attempt a send for a guest order (no user_id, therefore no possible push token)", async () => {
    const order = await seedOrder({ user_id: null, guest_email: `guest-shipped-${crypto.randomUUID()}@mailinator.com`, status: "fulfilled" });
    const response = await request(order.id, { status: "shipped" });
    expect(response.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not send when the caller's user_id has no registered push tokens at all", async () => {
    const order = await seedOrder({ status: "fulfilled" });
    const response = await request(order.id, { status: "shipped" });
    expect(response.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not send for a status change that isn't 'shipped'", async () => {
    const order = await seedOrder({ status: "paid" });
    const response = await request(order.id, { status: "fulfilled", trackingNumber: "1Z999AA10123456784" });
    expect(response.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
