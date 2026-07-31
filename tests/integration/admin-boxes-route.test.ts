// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postBox } from "@/app/api/admin/boxes/route";
import { PATCH as patchBox, DELETE as deleteBox } from "@/app/api/admin/boxes/[id]/route";
import { getActiveBoxes } from "@/lib/supabase/queries/catalog";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerUserId: string;
let customerToken: string;
const createdBoxIds: string[] = [];

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-boxes-${crypto.randomUUID()}@mailinator.com`;
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

  const customerEmail = `test-customer-boxes-${crypto.randomUUID()}@mailinator.com`;
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
  for (const id of createdBoxIds) {
    await admin.from("boxes").delete().eq("id", id);
  }
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (customerUserId) await admin.auth.admin.deleteUser(customerUserId);
});

function boxRequest(url: string, method: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, { method, headers, body: JSON.stringify(body) });
}

describe("POST /api/admin/boxes", () => {
  it("creates a box and writes a box_create audit_logs row, and it appears live on the storefront once active", async () => {
    const slug = `test-admin-box-${crypto.randomUUID()}`;
    const response = await postBox(
      boxRequest("http://localhost:3000/api/admin/boxes", "POST", {
        slug,
        title: "Test Admin Box",
        priceCents: 1999,
        status: "active",
      }, adminToken)
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    createdBoxIds.push(body.data.id);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action, before, after")
      .eq("entity_id", body.data.id)
      .eq("action", "box_create");
    expect(logs).toHaveLength(1);
    expect(logs![0].before).toBeNull();
    expect(logs![0].after).toMatchObject({ slug, title: "Test Admin Box", status: "active" });

    const activeBoxes = await getActiveBoxes();
    expect(activeBoxes.some((b) => b.slug === slug)).toBe(true);
  });

  it("rejects a non-admin with 403", async () => {
    const response = await postBox(
      boxRequest("http://localhost:3000/api/admin/boxes", "POST", {
        slug: `test-rejected-${crypto.randomUUID()}`,
        title: "Should not be created",
        priceCents: 100,
      }, customerToken)
    );
    expect(response.status).toBe(403);
  });

  it("rejects a request with no bearer token with 401", async () => {
    const response = await postBox(
      boxRequest("http://localhost:3000/api/admin/boxes", "POST", { slug: "x", title: "x", priceCents: 100 })
    );
    expect(response.status).toBe(401);
  });

  it("rejects build_a_box without a slotCount", async () => {
    const response = await postBox(
      boxRequest("http://localhost:3000/api/admin/boxes", "POST", {
        slug: `test-invalid-${crypto.randomUUID()}`,
        title: "Invalid",
        priceCents: 100,
        boxType: "build_a_box",
      }, adminToken)
    );
    expect(response.status).toBe(400);
  });
});

describe("PATCH/DELETE /api/admin/boxes/[id]", () => {
  it("edits a box and writes a correct before/after box_update audit_logs row", async () => {
    const { data: box } = await admin
      .from("boxes")
      .insert({ slug: `test-edit-${crypto.randomUUID()}`, title: "Original Title", price_cents: 1000, status: "draft" })
      .select("id")
      .single();
    createdBoxIds.push(box!.id);

    const response = await patchBox(
      boxRequest(`http://localhost:3000/api/admin/boxes/${box!.id}`, "PATCH", { title: "Updated Title" }, adminToken),
      { params: Promise.resolve({ id: box!.id }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.title).toBe("Updated Title");

    const { data: logs } = await admin
      .from("audit_logs")
      .select("before, after")
      .eq("entity_id", box!.id)
      .eq("action", "box_update");
    expect(logs).toHaveLength(1);
    expect(logs![0].before).toMatchObject({ title: "Original Title" });
    expect(logs![0].after).toMatchObject({ title: "Updated Title" });
  });

  it("soft-deletes a box (sets deleted_at, never hard-deletes) with a box_delete audit_logs row", async () => {
    const { data: box } = await admin
      .from("boxes")
      .insert({ slug: `test-delete-${crypto.randomUUID()}`, title: "To Delete", price_cents: 1000, status: "active" })
      .select("id")
      .single();
    createdBoxIds.push(box!.id);

    const response = await deleteBox(
      boxRequest(`http://localhost:3000/api/admin/boxes/${box!.id}`, "DELETE", null, adminToken),
      { params: Promise.resolve({ id: box!.id }) }
    );
    expect(response.status).toBe(200);

    const { data: after } = await admin.from("boxes").select("deleted_at").eq("id", box!.id).single();
    expect(after!.deleted_at).not.toBeNull();

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", box!.id)
      .eq("action", "box_delete");
    expect(logs).toHaveLength(1);
  });

  it("rejects a non-admin with 403 on PATCH", async () => {
    const { data: box } = await admin
      .from("boxes")
      .insert({ slug: `test-403-${crypto.randomUUID()}`, title: "Protected", price_cents: 1000 })
      .select("id")
      .single();
    createdBoxIds.push(box!.id);

    const response = await patchBox(
      boxRequest(`http://localhost:3000/api/admin/boxes/${box!.id}`, "PATCH", { title: "Hacked" }, customerToken),
      { params: Promise.resolve({ id: box!.id }) }
    );
    expect(response.status).toBe(403);
  });
});
