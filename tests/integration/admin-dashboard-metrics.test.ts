// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getSalesToday,
  getOrdersAwaitingFulfillmentCount,
  getLowStockSnacks,
  getActiveSubscriptionsCount,
  getCustomerGrowth,
  getRepeatPurchaseRate,
  getReferralMetrics,
  getRevenueTrends,
} from "@/lib/supabase/queries/admin-dashboard";

// Milestone 8, Task 2. This is a live shared project with pre-existing data
// from every other milestone's tests, so these assertions are all
// delta-based (seed one known row, confirm the metric moved by exactly
// that amount) rather than asserting an absolute value - the same pattern
// already established in admin-dashboard-foundations.test.ts and
// subscription-renewal-webhook.test.ts.

const admin = createAdminSupabaseClient();

const createdOrderIds: string[] = [];
const createdUserIds: string[] = [];
const createdSubscriptionIds: string[] = [];
const createdReferralIds: string[] = [];
const inventoryRestores: Array<{ snackId: string; quantity: number }> = [];
const ledgerRestoreOrderIds: string[] = [];

afterEach(async () => {
  for (const orderId of createdOrderIds) {
    await admin.from("rewards_ledger").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  createdOrderIds.length = 0;

  for (const id of createdSubscriptionIds) {
    await admin.from("subscriptions").delete().eq("id", id);
  }
  createdSubscriptionIds.length = 0;

  for (const id of createdReferralIds) {
    await admin.from("referrals").delete().eq("id", id);
  }
  createdReferralIds.length = 0;

  for (const orderId of ledgerRestoreOrderIds) {
    await admin.from("rewards_ledger").delete().eq("order_id", orderId);
  }
  ledgerRestoreOrderIds.length = 0;

  for (const { snackId, quantity } of inventoryRestores) {
    await admin.from("inventory").update({ quantity_on_hand: quantity }).eq("snack_id", snackId);
  }
  inventoryRestores.length = 0;

  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
  createdUserIds.length = 0;
});

async function createTestUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `test-admin-metrics-${crypto.randomUUID()}@mailinator.com`,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error;
  createdUserIds.push(data.user.id);
  return data.user.id;
}

describe("getSalesToday", () => {
  it("increases by exactly a newly seeded paid order's total", async () => {
    const before = await getSalesToday();
    const userId = await createTestUser();
    const { data: order } = await admin
      .from("orders")
      .insert({ user_id: userId, status: "paid", total_amount_cents: 4321 })
      .select("id")
      .single();
    createdOrderIds.push(order!.id);

    const after = await getSalesToday();
    expect(after - before).toBe(4321);
  });
});

describe("getOrdersAwaitingFulfillmentCount", () => {
  it("increases by exactly one for a newly seeded paid order", async () => {
    const before = await getOrdersAwaitingFulfillmentCount();
    const userId = await createTestUser();
    const { data: order } = await admin
      .from("orders")
      .insert({ user_id: userId, status: "paid", total_amount_cents: 100 })
      .select("id")
      .single();
    createdOrderIds.push(order!.id);

    const after = await getOrdersAwaitingFulfillmentCount();
    expect(after - before).toBe(1);
  });
});

describe("getLowStockSnacks", () => {
  it("includes a snack dropped below the threshold and excludes it once restored", async () => {
    const { data: snack } = await admin.from("snacks").select("id").eq("is_sellable_individually", true).limit(1).single();
    const { data: inv } = await admin.from("inventory").select("quantity_on_hand").eq("snack_id", snack!.id).single();
    inventoryRestores.push({ snackId: snack!.id, quantity: inv!.quantity_on_hand });

    await admin.from("inventory").update({ quantity_on_hand: 3 }).eq("snack_id", snack!.id);
    const lowStock = await getLowStockSnacks();
    expect(lowStock.some((s) => s.snackId === snack!.id && s.quantityOnHand === 3)).toBe(true);

    await admin.from("inventory").update({ quantity_on_hand: 999 }).eq("snack_id", snack!.id);
    const notLowStock = await getLowStockSnacks();
    expect(notLowStock.some((s) => s.snackId === snack!.id)).toBe(false);
  });
});

describe("getActiveSubscriptionsCount", () => {
  it("increases by exactly one for a newly seeded active subscription", async () => {
    const before = await getActiveSubscriptionsCount();
    const userId = await createTestUser();
    const { data: box } = await admin.from("boxes").select("id").eq("is_subscription", true).limit(1).single();
    const { data: subscription } = await admin
      .from("subscriptions")
      .insert({
        user_id: userId,
        box_id: box!.id,
        stripe_subscription_id: `sub_test_metrics_${crypto.randomUUID()}`,
        status: "active",
      })
      .select("id")
      .single();
    createdSubscriptionIds.push(subscription!.id);

    const after = await getActiveSubscriptionsCount();
    expect(after - before).toBe(1);
  });
});

describe("getCustomerGrowth", () => {
  it("counts a newly created user in today's bucket", async () => {
    const before = await getCustomerGrowth(30);
    const today = new Date().toISOString().slice(0, 10);
    const beforeToday = before.find((p) => p.date === today)?.newCustomers ?? 0;

    await createTestUser();

    const after = await getCustomerGrowth(30);
    const afterToday = after.find((p) => p.date === today)?.newCustomers ?? 0;
    expect(afterToday - beforeToday).toBe(1);
  });
});

describe("getRepeatPurchaseRate", () => {
  it("matches a hand-computed percentage from customer_lifetime_value directly", async () => {
    const { data: rows } = await admin.from("customer_lifetime_value").select("total_orders");
    const expected = rows!.length === 0 ? 0 : (rows!.filter((r) => (r.total_orders ?? 0) >= 2).length / rows!.length) * 100;

    const actual = await getRepeatPurchaseRate();
    expect(actual).toBeCloseTo(expected, 5);
  });
});

describe("getReferralMetrics", () => {
  it("counts seeded referrals by status correctly", async () => {
    const before = await getReferralMetrics();
    const referrerId = await createTestUser();
    const referredId = await createTestUser();

    const { data: referral } = await admin
      .from("referrals")
      .insert({ referrer_id: referrerId, referred_id: referredId, status: "credited" })
      .select("id")
      .single();
    createdReferralIds.push(referral!.id);

    const after = await getReferralMetrics();
    expect(after.sent - before.sent).toBe(1);
    expect(after.converted - before.converted).toBe(1);
  });
});

describe("getRevenueTrends", () => {
  it("includes a newly seeded paid order's amount in today's stream total", async () => {
    const { data: snack } = await admin.from("snacks").select("id").eq("is_sellable_individually", true).limit(1).single();
    const before = await getRevenueTrends(30);
    const today = new Date().toISOString().slice(0, 10);
    const beforeAmount = before.find((r) => r.date === today && r.stream === "a_la_carte_snack")?.revenueCents ?? 0;

    const userId = await createTestUser();
    const { data: order } = await admin
      .from("orders")
      .insert({ user_id: userId, status: "paid", total_amount_cents: 777 })
      .select("id")
      .single();
    createdOrderIds.push(order!.id);
    await admin
      .from("order_items")
      .insert({ order_id: order!.id, item_type: "snack", snack_id: snack!.id, quantity: 1, unit_price_cents: 777 });

    const after = await getRevenueTrends(30);
    const afterAmount = after.find((r) => r.date === today && r.stream === "a_la_carte_snack")?.revenueCents ?? 0;
    expect(afterAmount - beforeAmount).toBe(777);
  });
});
