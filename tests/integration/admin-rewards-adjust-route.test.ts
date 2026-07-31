// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postAdjust } from "@/app/api/admin/rewards/adjust/route";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerUserId: string;
let customerToken: string;

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-rewards-${crypto.randomUUID()}@mailinator.com`;
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

  const customerEmail = `test-customer-rewards-${crypto.randomUUID()}@mailinator.com`;
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
  // rewards_ledger.user_id has no ON DELETE CASCADE (append-only ledger,
  // same as order_id - see checkout-webhook-route.test.ts's teardown
  // comment), so it must be cleared before deleting the users.
  await admin.from("rewards_ledger").delete().eq("user_id", customerUserId);
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (customerUserId) await admin.auth.admin.deleteUser(customerUserId);
});

function request(body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/admin/rewards/adjust", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/rewards/adjust", () => {
  it("credits points, writes exactly one ledger row, updates the cached balance, and writes an audit log", async () => {
    const { data: before } = await admin.from("profiles").select("rewards_points").eq("id", customerUserId).single();

    const response = await postAdjust(request({ userId: customerUserId, deltaPoints: 250 }, adminToken));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.rewards_points).toBe((before!.rewards_points ?? 0) + 250);

    const { data: ledgerRows } = await admin
      .from("rewards_ledger")
      .select("delta_points, reason, order_id")
      .eq("user_id", customerUserId)
      .eq("reason", "admin_adjustment");
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows![0]!.delta_points).toBe(250);
    expect(ledgerRows![0]!.order_id).toBeNull();

    const { data: after } = await admin.from("profiles").select("rewards_points").eq("id", customerUserId).single();
    expect(after!.rewards_points).toBe((before!.rewards_points ?? 0) + 250);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", customerUserId)
      .eq("action", "rewards_adjust");
    expect(logs!.length).toBeGreaterThanOrEqual(1);
  });

  it("applies a negative adjustment correctly", async () => {
    const { data: before } = await admin.from("profiles").select("rewards_points").eq("id", customerUserId).single();

    const response = await postAdjust(request({ userId: customerUserId, deltaPoints: -50 }, adminToken));
    expect(response.status).toBe(200);

    const { data: after } = await admin.from("profiles").select("rewards_points").eq("id", customerUserId).single();
    expect(after!.rewards_points).toBe((before!.rewards_points ?? 0) - 50);
  });

  it("rejects a zero deltaPoints with 400", async () => {
    const response = await postAdjust(request({ userId: customerUserId, deltaPoints: 0 }, adminToken));
    expect(response.status).toBe(400);
  });

  it("rejects a non-admin with 403", async () => {
    const response = await postAdjust(request({ userId: customerUserId, deltaPoints: 10 }, customerToken));
    expect(response.status).toBe(403);
  });

  it("rejects a request with no bearer token with 401", async () => {
    const response = await postAdjust(request({ userId: customerUserId, deltaPoints: 10 }));
    expect(response.status).toBe(401);
  });
});
