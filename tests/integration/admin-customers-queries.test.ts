// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { listCustomers, getCustomerDetail } from "@/lib/supabase/queries/admin-customers";

// Milestone 8, Task 7. No mutation route exists at this layer yet (list/detail
// are read-only Server Component queries, same as Task 2's Operations
// Dashboard - see admin-dashboard-metrics.test.ts's header comment), so
// there's no 403 boundary to test here; page-level admin auth is Task 11's
// job (adding the real (admin) layout guard). These tests instead verify the
// aggregation itself matches hand-seeded data exactly.

const admin = createAdminSupabaseClient();

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];

afterEach(async () => {
  for (const orderId of createdOrderIds) {
    await admin.from("orders").delete().eq("id", orderId);
  }
  createdOrderIds.length = 0;
  for (const id of createdUserIds) {
    // customer_activity has no ON DELETE CASCADE from profiles (unlike
    // customer_preferences, which does) - see the initial schema migration -
    // so it must be cleared first or auth.admin.deleteUser's cascade into
    // profiles fails with a foreign key violation.
    await admin.from("customer_activity").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  createdUserIds.length = 0;
});

async function createTestUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true });
  if (error || !data.user) throw error;
  createdUserIds.push(data.user.id);
  return data.user.id;
}

describe("listCustomers", () => {
  it("finds a newly created customer by a case-insensitive partial email match", async () => {
    const uniqueTag = crypto.randomUUID();
    const email = `test-admin-customers-${uniqueTag}@mailinator.com`;
    await createTestUser(email);

    const { customers, total } = await listCustomers({ search: uniqueTag.toUpperCase() });
    expect(total).toBe(1);
    expect(customers).toHaveLength(1);
    expect(customers[0]!.email).toBe(email);
    expect(customers[0]!.totalOrders).toBe(0);
    expect(customers[0]!.totalSpendCents).toBe(0);
  });
});

describe("getCustomerDetail", () => {
  it("returns null for a user id that doesn't exist", async () => {
    const detail = await getCustomerDetail("00000000-0000-0000-0000-000000000000");
    expect(detail).toBeNull();
  });

  it("aggregates lifetime value, preferences, activity, and recent orders exactly as seeded", async () => {
    const email = `test-admin-customer-detail-${crypto.randomUUID()}@mailinator.com`;
    const userId = await createTestUser(email);

    const { data: order } = await admin
      .from("orders")
      .insert({ user_id: userId, status: "paid", total_amount_cents: 2500 })
      .select("id")
      .single();
    createdOrderIds.push(order!.id);

    await admin.from("customer_preferences").insert({
      user_id: userId,
      dietary_restrictions: ["gluten_free"],
      disliked_categories: ["mint"],
      flavor_profile: ["spicy"],
      spice_tolerance: "hot",
      marketing_opt_in: true,
    });

    await admin.from("customer_activity").insert({
      user_id: userId,
      event_type: "order_placed",
      metadata: { orderId: order!.id },
    });

    const detail = await getCustomerDetail(userId);
    expect(detail).not.toBeNull();
    expect(detail!.email).toBe(email);
    expect(detail!.lifetimeValue.totalOrders).toBe(1);
    expect(detail!.lifetimeValue.totalSpendCents).toBe(2500);
    expect(detail!.preferences).toEqual({
      dietaryRestrictions: ["gluten_free"],
      dislikedCategories: ["mint"],
      flavorProfile: ["spicy"],
      spiceTolerance: "hot",
      marketingOptIn: true,
    });
    expect(detail!.recentOrders).toHaveLength(1);
    expect(detail!.recentOrders[0]!.id).toBe(order!.id);
    expect(detail!.recentActivity).toHaveLength(1);
    expect(detail!.recentActivity[0]!.eventType).toBe("order_placed");
  });
});
