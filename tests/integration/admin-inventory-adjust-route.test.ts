// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postAdjust } from "@/app/api/admin/inventory/[snackId]/adjust/route";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerToken: string;
let snackId: string;
let originalQuantity: number;

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-inventory-${crypto.randomUUID()}@mailinator.com`;
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

  const customerEmail = `test-customer-inventory-${crypto.randomUUID()}@mailinator.com`;
  await admin.auth.admin.createUser({ email: customerEmail, password, email_confirm: true });
  const { data: customerSession } = await anonAuthClient.auth.signInWithPassword({ email: customerEmail, password });
  customerToken = customerSession!.session!.access_token;

  const { data: snack } = await admin.from("snacks").select("id").eq("is_sellable_individually", true).limit(1).single();
  snackId = snack!.id;
  const { data: inv } = await admin.from("inventory").select("quantity_on_hand").eq("snack_id", snackId).single();
  originalQuantity = inv!.quantity_on_hand;
});

afterAll(async () => {
  await admin.from("inventory").update({ quantity_on_hand: originalQuantity }).eq("snack_id", snackId);
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
});

afterEach(async () => {
  await admin.from("inventory_events").delete().eq("snack_id", snackId).in("reason", ["restock", "adjustment"]);
});

function adjustRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost:3000/api/admin/inventory/${snackId}/adjust`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/inventory/[snackId]/adjust", () => {
  it("applies a restock and writes an inventory_adjust audit_logs row", async () => {
    const response = await postAdjust(adjustRequest({ delta: 10, reason: "restock" }, adminToken), {
      params: Promise.resolve({ snackId }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.quantity_on_hand).toBe(originalQuantity + 10);

    await admin.from("inventory").update({ quantity_on_hand: originalQuantity }).eq("snack_id", snackId);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", snackId)
      .eq("action", "inventory_adjust");
    expect(logs!.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a delta that would go negative with 400", async () => {
    const response = await postAdjust(
      adjustRequest({ delta: -(originalQuantity + 1000), reason: "adjustment" }, adminToken),
      { params: Promise.resolve({ snackId }) }
    );
    expect(response.status).toBe(400);

    const { data: inv } = await admin.from("inventory").select("quantity_on_hand").eq("snack_id", snackId).single();
    expect(inv!.quantity_on_hand).toBe(originalQuantity);
  });

  it("rejects a non-admin with 403", async () => {
    const response = await postAdjust(adjustRequest({ delta: 5, reason: "restock" }, customerToken), {
      params: Promise.resolve({ snackId }),
    });
    expect(response.status).toBe(403);
  });
});
