// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const admin = createAdminSupabaseClient();

let snackAId: string;
let snackBId: string;
let originalQuantityA: number;
let originalQuantityB: number;

const createdCartIds: string[] = [];
const inventoryRestores: Array<{ snackId: string; quantity: number }> = [];
const createdDropIds: string[] = [];

beforeAll(async () => {
  const { data: snacks } = await admin
    .from("snacks")
    .select("id")
    .eq("is_sellable_individually", true)
    .limit(2);
  snackAId = snacks![0].id;
  snackBId = snacks![1].id;

  const { data: invA } = await admin
    .from("inventory")
    .select("quantity_on_hand")
    .eq("snack_id", snackAId)
    .single();
  const { data: invB } = await admin
    .from("inventory")
    .select("quantity_on_hand")
    .eq("snack_id", snackBId)
    .single();
  originalQuantityA = invA!.quantity_on_hand;
  originalQuantityB = invB!.quantity_on_hand;
});

afterEach(async () => {
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;

  for (const { snackId, quantity } of inventoryRestores) {
    await admin.from("inventory").update({ quantity_on_hand: quantity }).eq("snack_id", snackId);
  }
  inventoryRestores.length = 0;

  for (const dropId of createdDropIds) {
    await admin.from("drops").delete().eq("id", dropId);
  }
  createdDropIds.length = 0;
});

async function createCartWithSnackLine(snackId: string, quantity: number) {
  const { data: cart } = await admin
    .from("carts")
    .insert({ anonymous_id: crypto.randomUUID() })
    .select("id")
    .single();
  createdCartIds.push(cart!.id);
  await admin.from("cart_items").insert({ cart_id: cart!.id, item_type: "snack", snack_id: snackId, quantity });
  return cart!.id;
}

describe("reserve_inventory_for_cart", () => {
  it("reserves exactly the needed stock and writes a checkout_hold event", async () => {
    const cartId = await createCartWithSnackLine(snackAId, 2);
    inventoryRestores.push({ snackId: snackAId, quantity: originalQuantityA });

    const { data, error } = await admin.rpc("reserve_inventory_for_cart", { p_cart_id: cartId });
    expect(error).toBeNull();
    expect(data).toEqual([{ snack_id: snackAId, quantity: 2 }]);

    const { data: inv } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackAId)
      .single();
    expect(inv!.quantity_on_hand).toBe(originalQuantityA - 2);

    const { data: events } = await admin
      .from("inventory_events")
      .select("delta, reason, reference_id")
      .eq("reference_id", cartId)
      .eq("reason", "checkout_hold");
    expect(events).toHaveLength(1);
    expect(events![0].delta).toBe(-2);
  });

  it("raises and leaves every snack's stock unchanged when any one snack lacks sufficient stock (no partial reservation)", async () => {
    // Starve snack B so its line can never be satisfied, while snack A in
    // the same cart is requested at an easily satisfiable quantity - this
    // proves the whole reservation rolls back, not just the failing line.
    await admin.from("inventory").update({ quantity_on_hand: 0 }).eq("snack_id", snackBId);
    inventoryRestores.push({ snackId: snackBId, quantity: originalQuantityB });
    inventoryRestores.push({ snackId: snackAId, quantity: originalQuantityA });

    const { data: cart } = await admin
      .from("carts")
      .insert({ anonymous_id: crypto.randomUUID() })
      .select("id")
      .single();
    createdCartIds.push(cart!.id);
    await admin.from("cart_items").insert([
      { cart_id: cart!.id, item_type: "snack", snack_id: snackAId, quantity: 1 },
      { cart_id: cart!.id, item_type: "snack", snack_id: snackBId, quantity: 1 },
    ]);

    const { error } = await admin.rpc("reserve_inventory_for_cart", { p_cart_id: cart!.id });
    expect(error).not.toBeNull();

    const { data: invA } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackAId)
      .single();
    const { data: invB } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackBId)
      .single();
    expect(invA!.quantity_on_hand).toBe(originalQuantityA);
    expect(invB!.quantity_on_hand).toBe(0);

    const { data: events } = await admin.from("inventory_events").select("id").eq("reference_id", cart!.id);
    expect(events).toHaveLength(0);
  });
});

describe("release_inventory_for_cart", () => {
  it("restores the exact held quantities and is idempotent", async () => {
    const cartId = await createCartWithSnackLine(snackAId, 3);
    inventoryRestores.push({ snackId: snackAId, quantity: originalQuantityA });

    await admin.rpc("reserve_inventory_for_cart", { p_cart_id: cartId });
    const { data: afterReserve } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackAId)
      .single();
    expect(afterReserve!.quantity_on_hand).toBe(originalQuantityA - 3);

    const { error: firstReleaseError } = await admin.rpc("release_inventory_for_cart", { p_cart_id: cartId });
    expect(firstReleaseError).toBeNull();

    const { data: afterRelease } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackAId)
      .single();
    expect(afterRelease!.quantity_on_hand).toBe(originalQuantityA);

    // Second release call must be a no-op - proves idempotency.
    await admin.rpc("release_inventory_for_cart", { p_cart_id: cartId });
    const { data: afterSecondRelease } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", snackAId)
      .single();
    expect(afterSecondRelease!.quantity_on_hand).toBe(originalQuantityA);

    const { data: releaseEvents } = await admin
      .from("inventory_events")
      .select("id")
      .eq("reference_id", cartId)
      .eq("reason", "checkout_release");
    expect(releaseEvents).toHaveLength(1);
  });
});

describe("increment_drop_units_sold", () => {
  async function createDrop(quantityLimit: number, unitsSold: number) {
    const { data: box } = await admin.from("boxes").select("id").eq("status", "active").limit(1).single();
    const { data: drop } = await admin
      .from("drops")
      .insert({
        box_id: box!.id,
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 60_000).toISOString(),
        quantity_limit: quantityLimit,
        units_sold: unitsSold,
      })
      .select("id")
      .single();
    createdDropIds.push(drop!.id);
    return drop!.id;
  }

  it("increments units_sold and returns true when under the limit", async () => {
    const dropId = await createDrop(10, 5);

    const { data, error } = await admin.rpc("increment_drop_units_sold", { p_drop_id: dropId, p_qty: 2 });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const { data: drop } = await admin.from("drops").select("units_sold").eq("id", dropId).single();
    expect(drop!.units_sold).toBe(7);
  });

  it("returns false without raising and leaves units_sold unchanged when it would exceed quantity_limit", async () => {
    const dropId = await createDrop(10, 9);

    const { data, error } = await admin.rpc("increment_drop_units_sold", { p_drop_id: dropId, p_qty: 5 });
    expect(error).toBeNull();
    expect(data).toBe(false);

    const { data: drop } = await admin.from("drops").select("units_sold").eq("id", dropId).single();
    expect(drop!.units_sold).toBe(9);
  });
});
