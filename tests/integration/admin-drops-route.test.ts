// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postDrop } from "@/app/api/admin/drops/route";
import { PATCH as patchDrop } from "@/app/api/admin/drops/[id]/route";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerUserId: string;
let customerToken: string;
let boxId: string;
const createdDropIds: string[] = [];

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-drops-${crypto.randomUUID()}@mailinator.com`;
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

  const customerEmail = `test-customer-drops-${crypto.randomUUID()}@mailinator.com`;
  const { data: customerUser, error: customerError } = await admin.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
  });
  if (customerError || !customerUser.user) throw customerError;
  customerUserId = customerUser.user.id;
  const { data: customerSession } = await anonAuthClient.auth.signInWithPassword({ email: customerEmail, password });
  customerToken = customerSession!.session!.access_token;

  const { data: box } = await admin.from("boxes").select("id").is("deleted_at", null).limit(1).single();
  boxId = box!.id;
});

afterAll(async () => {
  for (const id of createdDropIds) {
    await admin.from("drops").delete().eq("id", id);
  }
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (customerUserId) await admin.auth.admin.deleteUser(customerUserId);
});

function request(url: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

function futureWindow() {
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  return { startsAt, endsAt };
}

describe("POST /api/admin/drops", () => {
  it("creates a drop and writes a drop_create audit_logs row", async () => {
    const { startsAt, endsAt } = futureWindow();
    const response = await postDrop(
      request("http://localhost:3000/api/admin/drops", "POST", { boxId, startsAt, endsAt, quantityLimit: 50 }, adminToken)
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.box_id).toBe(boxId);
    expect(body.data.quantity_limit).toBe(50);
    expect(body.data.units_sold).toBe(0);
    createdDropIds.push(body.data.id);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", body.data.id)
      .eq("action", "drop_create");
    expect(logs!.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects endsAt before startsAt with 400", async () => {
    const response = await postDrop(
      request("http://localhost:3000/api/admin/drops", "POST", {
        boxId,
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        quantityLimit: 10,
      }, adminToken)
    );
    expect(response.status).toBe(400);
  });

  it("rejects a non-admin with 403", async () => {
    const { startsAt, endsAt } = futureWindow();
    const response = await postDrop(
      request("http://localhost:3000/api/admin/drops", "POST", { boxId, startsAt, endsAt, quantityLimit: 10 }, customerToken)
    );
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/admin/drops/[id]", () => {
  it("edits a drop's quantity_limit and writes a correct before/after drop_update audit_logs row", async () => {
    const { startsAt, endsAt } = futureWindow();
    const createResponse = await postDrop(
      request("http://localhost:3000/api/admin/drops", "POST", { boxId, startsAt, endsAt, quantityLimit: 20 }, adminToken)
    );
    const created = await createResponse.json();
    createdDropIds.push(created.data.id);

    const response = await patchDrop(
      request(`http://localhost:3000/api/admin/drops/${created.data.id}`, "PATCH", { quantityLimit: 75 }, adminToken),
      { params: Promise.resolve({ id: created.data.id }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.quantity_limit).toBe(75);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("before, after")
      .eq("entity_id", created.data.id)
      .eq("action", "drop_update")
      .single();
    expect((logs!.before as { quantity_limit: number }).quantity_limit).toBe(20);
    expect((logs!.after as { quantity_limit: number }).quantity_limit).toBe(75);
  });

  it("rejects an edit that would make endsAt before startsAt with 400", async () => {
    const { startsAt, endsAt } = futureWindow();
    const createResponse = await postDrop(
      request("http://localhost:3000/api/admin/drops", "POST", { boxId, startsAt, endsAt, quantityLimit: 20 }, adminToken)
    );
    const created = await createResponse.json();
    createdDropIds.push(created.data.id);

    const response = await patchDrop(
      request(
        `http://localhost:3000/api/admin/drops/${created.data.id}`,
        "PATCH",
        { endsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
        adminToken
      ),
      { params: Promise.resolve({ id: created.data.id }) }
    );
    expect(response.status).toBe(400);
  });

  it("rejects a non-admin with 403", async () => {
    const { startsAt, endsAt } = futureWindow();
    const createResponse = await postDrop(
      request("http://localhost:3000/api/admin/drops", "POST", { boxId, startsAt, endsAt, quantityLimit: 20 }, adminToken)
    );
    const created = await createResponse.json();
    createdDropIds.push(created.data.id);

    const response = await patchDrop(
      request(`http://localhost:3000/api/admin/drops/${created.data.id}`, "PATCH", { quantityLimit: 999 }, customerToken),
      { params: Promise.resolve({ id: created.data.id }) }
    );
    expect(response.status).toBe(403);
  });
});
