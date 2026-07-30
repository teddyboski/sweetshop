// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const admin = createAdminSupabaseClient();

let snackId: string;
let originalQuantity: number;

const inventoryRestores: Array<{ snackId: string; quantity: number }> = [];

beforeAll(async () => {
  const { data: snack } = await admin
    .from("snacks")
    .select("id")
    .eq("is_sellable_individually", true)
    .limit(1)
    .single();
  snackId = snack!.id;

  const { data: inv } = await admin
    .from("inventory")
    .select("quantity_on_hand")
    .eq("snack_id", snackId)
    .single();
  originalQuantity = inv!.quantity_on_hand;
});

afterEach(async () => {
  for (const { snackId: id, quantity } of inventoryRestores) {
    await admin.from("inventory").update({ quantity_on_hand: quantity }).eq("snack_id", id);
    await admin.from("inventory_events").delete().eq("snack_id", id).in("reason", ["restock", "adjustment"]);
  }
  inventoryRestores.length = 0;
});

describe("adjust_inventory", () => {
  it("raises and leaves quantity_on_hand unchanged when the delta would go negative", async () => {
    const { error } = await admin.rpc("adjust_inventory", {
      p_snack_id: snackId,
      p_delta: -(originalQuantity + 1000),
      p_reason: "adjustment",
    });
    expect(error).not.toBeNull();

    const { data: inv } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackId)
      .single();
    expect(inv!.quantity_on_hand).toBe(originalQuantity);
  });

  it("succeeds and writes exactly one new inventory_events row for a valid delta", async () => {
    inventoryRestores.push({ snackId, quantity: originalQuantity });

    // Count before/after rather than asserting an absolute length - this is
    // a live shared project, and other adjustments to this same snack could
    // already exist from earlier runs. Proving our own call added exactly
    // one row is what actually matters here.
    const { count: countBefore } = await admin
      .from("inventory_events")
      .select("id", { count: "exact", head: true })
      .eq("snack_id", snackId)
      .eq("reason", "restock");

    const { error } = await admin.rpc("adjust_inventory", {
      p_snack_id: snackId,
      p_delta: 7,
      p_reason: "restock",
    });
    expect(error).toBeNull();

    const { data: inv } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackId)
      .single();
    expect(inv!.quantity_on_hand).toBe(originalQuantity + 7);

    const { data: events, count: countAfter } = await admin
      .from("inventory_events")
      .select("delta, reason", { count: "exact" })
      .eq("snack_id", snackId)
      .eq("reason", "restock")
      .order("created_at", { ascending: false });
    expect(countAfter).toBe((countBefore ?? 0) + 1);
    expect(events![0].delta).toBe(7);
  });
});

describe("revenue_by_stream_daily", () => {
  let userId: string;
  const orderIds: string[] = [];

  beforeAll(async () => {
    const email = `test-revenue-view-${crypto.randomUUID()}@mailinator.com`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: "password123",
      email_confirm: true,
    });
    if (error || !created.user) throw error;
    userId = created.user.id;
  });

  afterAll(async () => {
    for (const orderId of orderIds) {
      await admin.from("orders").delete().eq("id", orderId);
    }
    await admin.auth.admin.deleteUser(userId);
  });

  it("classifies and sums each seeded order correctly by revenue stream", async () => {
    const { data: subscriptionBox } = await admin
      .from("boxes")
      .select("id")
      .eq("is_subscription", true)
      .limit(1)
      .single();
    const { data: oneTimeBox } = await admin
      .from("boxes")
      .select("id")
      .eq("is_subscription", false)
      .eq("status", "active")
      .limit(1)
      .single();
    const { data: snack } = await admin
      .from("snacks")
      .select("id")
      .eq("is_sellable_individually", true)
      .limit(1)
      .single();

    async function seedPaidOrder(
      itemType: "box" | "snack",
      refId: string,
      unitPriceCents: number
    ) {
      const { data: order } = await admin
        .from("orders")
        .insert({ user_id: userId, status: "paid", total_amount_cents: unitPriceCents })
        .select("id")
        .single();
      orderIds.push(order!.id);
      await admin.from("order_items").insert({
        order_id: order!.id,
        item_type: itemType,
        box_id: itemType === "box" ? refId : null,
        snack_id: itemType === "snack" ? refId : null,
        quantity: 1,
        unit_price_cents: unitPriceCents,
      });
      return order!.id;
    }

    await seedPaidOrder("box", subscriptionBox!.id, 5000);
    await seedPaidOrder("box", oneTimeBox!.id, 1500);
    await seedPaidOrder("snack", snack!.id, 399);

    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await admin
      .from("revenue_by_stream_daily")
      .select("revenue_date, revenue_stream, revenue_cents")
      .eq("revenue_date", today);

    expect(error).toBeNull();

    const subscriptionRow = rows!.find((r) => r.revenue_stream === "subscription");
    const oneTimeRow = rows!.find((r) => r.revenue_stream === "one_time_box");
    const snackRow = rows!.find((r) => r.revenue_stream === "a_la_carte_snack");

    expect(subscriptionRow).toBeDefined();
    expect(oneTimeRow).toBeDefined();
    expect(snackRow).toBeDefined();
    // >= rather than === since this is a live shared project other orders
    // may already contribute to the same day/stream - proves our seeded
    // amount is fully counted, without assuming we're the only data today.
    expect(subscriptionRow!.revenue_cents).toBeGreaterThanOrEqual(5000);
    expect(oneTimeRow!.revenue_cents).toBeGreaterThanOrEqual(1500);
    expect(snackRow!.revenue_cents).toBeGreaterThanOrEqual(399);
  });
});
