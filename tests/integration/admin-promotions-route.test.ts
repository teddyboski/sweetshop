// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postPromotion } from "@/app/api/admin/promotions/route";
import { PATCH as patchPromotion } from "@/app/api/admin/promotions/[id]/route";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerUserId: string;
let customerToken: string;
const createdPromotionIds: string[] = [];

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-promotions-${crypto.randomUUID()}@mailinator.com`;
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

  const customerEmail = `test-customer-promotions-${crypto.randomUUID()}@mailinator.com`;
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
  for (const id of createdPromotionIds) {
    await admin.from("promotions").delete().eq("id", id);
  }
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (customerUserId) await admin.auth.admin.deleteUser(customerUserId);
});

function request(url: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

describe("POST /api/admin/promotions", () => {
  it("creates a promotion and writes a promotion_create audit_logs row", async () => {
    const code = `TEST${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const response = await postPromotion(
      request("http://localhost:3000/api/admin/promotions", "POST", {
        code,
        discountType: "percent",
        value: 15,
        usageLimit: 100,
        expiresAt: null,
      }, adminToken)
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.code).toBe(code);
    createdPromotionIds.push(body.data.id);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", body.data.id)
      .eq("action", "promotion_create");
    expect(logs!.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a non-admin with 403", async () => {
    const response = await postPromotion(
      request("http://localhost:3000/api/admin/promotions", "POST", {
        code: "SHOULDFAIL",
        discountType: "percent",
        value: 10,
      }, customerToken)
    );
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/admin/promotions/[id]", () => {
  it("edits a promotion and writes a correct before/after promotion_update audit_logs row", async () => {
    const code = `TEST${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const createResponse = await postPromotion(
      request("http://localhost:3000/api/admin/promotions", "POST", {
        code,
        discountType: "percent",
        value: 10,
      }, adminToken)
    );
    const created = await createResponse.json();
    createdPromotionIds.push(created.data.id);

    const response = await patchPromotion(
      request(`http://localhost:3000/api/admin/promotions/${created.data.id}`, "PATCH", { value: 25 }, adminToken),
      { params: Promise.resolve({ id: created.data.id }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.value).toBe(25);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("before, after")
      .eq("entity_id", created.data.id)
      .eq("action", "promotion_update")
      .single();
    expect((logs!.before as { value: number }).value).toBe(10);
    expect((logs!.after as { value: number }).value).toBe(25);
  });

  it("rejects a non-admin with 403", async () => {
    const code = `TEST${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const createResponse = await postPromotion(
      request("http://localhost:3000/api/admin/promotions", "POST", { code, discountType: "fixed", value: 500 }, adminToken)
    );
    const created = await createResponse.json();
    createdPromotionIds.push(created.data.id);

    const response = await patchPromotion(
      request(`http://localhost:3000/api/admin/promotions/${created.data.id}`, "PATCH", { value: 999 }, customerToken),
      { params: Promise.resolve({ id: created.data.id }) }
    );
    expect(response.status).toBe(403);
  });
});
