// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const admin = createAdminSupabaseClient();
let testUserId: string;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `test-guest-checkout-${crypto.randomUUID()}@sweetshop-test-fixtures.com`,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error;
  testUserId = data.user.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await admin.from("orders").delete().in("id", createdOrderIds);
  }
  if (testUserId) {
    await admin.auth.admin.deleteUser(testUserId);
  }
});

describe("orders_user_or_guest_email_check constraint", () => {
  it("allows an order with only user_id set", async () => {
    const { data, error } = await admin
      .from("orders")
      .insert({ user_id: testUserId })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) createdOrderIds.push(data.id);
  });

  it("allows an order with only guest_email set", async () => {
    const { data, error } = await admin
      .from("orders")
      .insert({ guest_email: "guest@sweetshop-test-fixtures.com" })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) createdOrderIds.push(data.id);
  });

  it("rejects an order with both user_id and guest_email set", async () => {
    const { error } = await admin
      .from("orders")
      .insert({ user_id: testUserId, guest_email: "guest@sweetshop-test-fixtures.com" });

    expect(error).not.toBeNull();
  });

  it("rejects an order with neither user_id nor guest_email set", async () => {
    const { error } = await admin.from("orders").insert({});

    expect(error).not.toBeNull();
  });
});
