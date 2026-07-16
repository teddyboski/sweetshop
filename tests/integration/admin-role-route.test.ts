// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PATCH } from "@/app/api/admin/users/[id]/role/route";
import { NextRequest } from "next/server";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let targetUserId: string;

beforeAll(async () => {
  const adminEmail = `test-admin-${crypto.randomUUID()}@example.com`;
  const targetEmail = `test-target-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();

  const { data: adminUser, error: adminCreateError } =
    await admin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
  if (adminCreateError || !adminUser.user) throw adminCreateError;
  adminUserId = adminUser.user.id;

  await admin.from("profiles").update({ role: "admin" }).eq("id", adminUserId);

  const { data: targetUser, error: targetCreateError } =
    await admin.auth.admin.createUser({
      email: targetEmail,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
  if (targetCreateError || !targetUser.user) throw targetCreateError;
  targetUserId = targetUser.user.id;

  const { data: session, error: signInError } =
    await admin.auth.signInWithPassword({ email: adminEmail, password });
  if (signInError || !session.session) throw signInError;
  adminToken = session.session.access_token;
});

afterAll(async () => {
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  if (targetUserId) await admin.auth.admin.deleteUser(targetUserId);
});

describe("PATCH /api/admin/users/[id]/role", () => {
  it("promotes a customer to admin and writes exactly one audit_logs row", async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/admin/users/${targetUserId}/role`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "admin" }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: targetUserId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.role).toBe("admin");

    const { data: logs } = await admin
      .from("audit_logs")
      .select("*")
      .eq("entity_id", targetUserId)
      .eq("action", "role_change");

    expect(logs).toHaveLength(1);
    expect(logs![0].before).toMatchObject({ role: "customer" });
    expect(logs![0].after).toMatchObject({ role: "admin" });
  });

  it("rejects requests with no bearer token", async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/admin/users/${targetUserId}/role`,
      { method: "PATCH", body: JSON.stringify({ role: "admin" }) }
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: targetUserId }),
    });
    expect(response.status).toBe(401);
  });
});
