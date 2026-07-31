// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postSnack } from "@/app/api/admin/snacks/route";
import { PATCH as patchSnack } from "@/app/api/admin/snacks/[id]/route";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerUserId: string;
let customerToken: string;
const createdSnackIds: string[] = [];

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-snacks-${crypto.randomUUID()}@mailinator.com`;
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

  const customerEmail = `test-customer-snacks-${crypto.randomUUID()}@mailinator.com`;
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
  for (const id of createdSnackIds) {
    await admin.from("snacks").delete().eq("id", id);
  }
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (customerUserId) await admin.auth.admin.deleteUser(customerUserId);
});

function snackRequest(url: string, method: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, { method, headers, body: JSON.stringify(body) });
}

describe("POST /api/admin/snacks", () => {
  it("creates a snack and writes a snack_create audit_logs row", async () => {
    const slug = `test-admin-snack-${crypto.randomUUID()}`;
    const response = await postSnack(
      snackRequest("http://localhost:3000/api/admin/snacks", "POST", {
        slug,
        name: "Test Admin Snack",
        isSellableIndividually: true,
      }, adminToken)
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    createdSnackIds.push(body.data.id);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("action, before, after")
      .eq("entity_id", body.data.id)
      .eq("action", "snack_create");
    expect(logs).toHaveLength(1);
    expect(logs![0].before).toBeNull();
    expect(logs![0].after).toMatchObject({ slug, name: "Test Admin Snack" });
  });

  it("rejects a non-admin with 403", async () => {
    const response = await postSnack(
      snackRequest("http://localhost:3000/api/admin/snacks", "POST", {
        slug: `test-rejected-${crypto.randomUUID()}`,
        name: "Should not be created",
      }, customerToken)
    );
    expect(response.status).toBe(403);
  });

  it("rejects a request with no bearer token with 401", async () => {
    const response = await postSnack(
      snackRequest("http://localhost:3000/api/admin/snacks", "POST", { slug: "x", name: "x" })
    );
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/admin/snacks/[id]", () => {
  it("edits a snack and writes a correct before/after snack_update audit_logs row", async () => {
    const { data: snack } = await admin
      .from("snacks")
      .insert({ slug: `test-edit-${crypto.randomUUID()}`, name: "Original Name" })
      .select("id")
      .single();
    createdSnackIds.push(snack!.id);

    const response = await patchSnack(
      snackRequest(`http://localhost:3000/api/admin/snacks/${snack!.id}`, "PATCH", { name: "Updated Name" }, adminToken),
      { params: Promise.resolve({ id: snack!.id }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.name).toBe("Updated Name");

    const { data: logs } = await admin
      .from("audit_logs")
      .select("before, after")
      .eq("entity_id", snack!.id)
      .eq("action", "snack_update");
    expect(logs).toHaveLength(1);
    expect(logs![0].before).toMatchObject({ name: "Original Name" });
    expect(logs![0].after).toMatchObject({ name: "Updated Name" });
  });

  it("rejects a non-admin with 403", async () => {
    const { data: snack } = await admin
      .from("snacks")
      .insert({ slug: `test-403-${crypto.randomUUID()}`, name: "Protected" })
      .select("id")
      .single();
    createdSnackIds.push(snack!.id);

    const response = await patchSnack(
      snackRequest(`http://localhost:3000/api/admin/snacks/${snack!.id}`, "PATCH", { name: "Hacked" }, customerToken),
      { params: Promise.resolve({ id: snack!.id }) }
    );
    expect(response.status).toBe(403);
  });
});
