// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getOrdersForUser,
  getOrderDetail,
  getSubscriptionsForUser,
  getPreferences,
  getAddresses,
  getRewardsLedger,
  getReferralsForUser,
} from "@/lib/supabase/queries/account";

// Same convention as rls-cross-user.test.ts: all fixtures are created once in
// beforeAll and read many times (these queries never mutate anything), with
// a single FK-safe teardown in afterAll. See that file's header comment on
// why the admin client itself is never used to sign in.
const admin = createAdminSupabaseClient();

let userAId: string;
let userBId: string;
let boxId: string;
let buildABoxId: string;
let snackId: string;
let byoSnackIds: string[];

let orderASnackId: string; // userA's snack order
let orderABuildABoxId: string; // userA's build-a-box order (tests snackSelections)
let orderBId: string; // userB's order - must never leak into userA's results

const createdOrderIds: string[] = [];
const createdSubscriptionIds: string[] = [];
const createdReferralIds: string[] = [];

const emailA = `test-account-a-${crypto.randomUUID()}@mailinator.com`;
const emailB = `test-account-b-${crypto.randomUUID()}@mailinator.com`;

beforeAll(async () => {
  const { data: userA, error: errorA } = await admin.auth.admin.createUser({
    email: emailA,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (errorA || !userA.user) throw errorA;
  userAId = userA.user.id;

  const { data: userB, error: errorB } = await admin.auth.admin.createUser({
    email: emailB,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (errorB || !userB.user) throw errorB;
  userBId = userB.user.id;

  const { data: box } = await admin
    .from("boxes")
    .select("id")
    .eq("status", "active")
    .eq("box_type", "curated")
    .limit(1)
    .single();
  boxId = box!.id;

  const { data: buildABox } = await admin
    .from("boxes")
    .select("id")
    .eq("status", "active")
    .eq("box_type", "build_a_box")
    .limit(1)
    .single();
  buildABoxId = buildABox!.id;

  const { data: snack } = await admin
    .from("snacks")
    .select("id")
    .eq("is_sellable_individually", true)
    .limit(1)
    .single();
  snackId = snack!.id;

  const { data: byoSnacks } = await admin.from("snacks").select("id").eq("is_byo_eligible", true).limit(2);
  byoSnackIds = byoSnacks!.map((s) => s.id);

  // --- Orders (user A: one snack order, one build-a-box order) ---
  const { data: orderA } = await admin
    .from("orders")
    .insert({
      user_id: userAId,
      status: "paid",
      total_amount_cents: 1000,
      shipping_address: { line1: "1 Test St", city: "Testville" },
    })
    .select("id")
    .single();
  orderASnackId = orderA!.id;
  createdOrderIds.push(orderASnackId);

  const { data: orderAItem } = await admin
    .from("order_items")
    .insert({ order_id: orderASnackId, item_type: "snack", snack_id: snackId, quantity: 2, unit_price_cents: 500 })
    .select("id")
    .single();
  void orderAItem;

  const { data: orderA2 } = await admin
    .from("orders")
    .insert({ user_id: userAId, status: "paid", total_amount_cents: 3000, shipping_address: null })
    .select("id")
    .single();
  orderABuildABoxId = orderA2!.id;
  createdOrderIds.push(orderABuildABoxId);

  const { data: orderA2Item } = await admin
    .from("order_items")
    .insert({ order_id: orderABuildABoxId, item_type: "box", box_id: buildABoxId, quantity: 1, unit_price_cents: 3000 })
    .select("id")
    .single();

  await admin.from("order_item_snacks").insert(
    byoSnackIds.map((sId) => ({ order_item_id: orderA2Item!.id, snack_id: sId, quantity: 1 }))
  );

  // --- Order belonging to user B - must never appear in user A's results ---
  const { data: orderB } = await admin
    .from("orders")
    .insert({ user_id: userBId, status: "paid", total_amount_cents: 2000, shipping_address: null })
    .select("id")
    .single();
  orderBId = orderB!.id;
  createdOrderIds.push(orderBId);
  await admin
    .from("order_items")
    .insert({ order_id: orderBId, item_type: "box", box_id: boxId, quantity: 1, unit_price_cents: 2000 });

  // --- Subscriptions ---
  const { data: subA } = await admin
    .from("subscriptions")
    .insert({
      user_id: userAId,
      box_id: boxId,
      stripe_subscription_id: `sub_test_a_${crypto.randomUUID()}`,
      status: "active",
    })
    .select("id")
    .single();
  createdSubscriptionIds.push(subA!.id);

  const { data: subB } = await admin
    .from("subscriptions")
    .insert({
      user_id: userBId,
      box_id: boxId,
      stripe_subscription_id: `sub_test_b_${crypto.randomUUID()}`,
      status: "active",
    })
    .select("id")
    .single();
  createdSubscriptionIds.push(subB!.id);

  // --- Preferences (only for user A - user B intentionally has none) ---
  await admin.from("customer_preferences").insert({
    user_id: userAId,
    dietary_restrictions: ["nut-free"],
    disliked_categories: ["licorice"],
    flavor_profile: ["sweet"],
    spice_tolerance: "mild",
    marketing_opt_in: false,
  });

  // --- Addresses (user A: one active default + one soft-deleted; user B: one active) ---
  await admin.from("customer_addresses").insert({
    user_id: userAId,
    recipient_name: "User A",
    line1: "1 Test St",
    city: "Testville",
    state: "CA",
    postal_code: "90210",
    is_default: true,
  });
  await admin.from("customer_addresses").insert({
    user_id: userAId,
    recipient_name: "User A Old",
    line1: "2 Old St",
    city: "Testville",
    state: "CA",
    postal_code: "90210",
    is_default: false,
    deleted_at: new Date().toISOString(),
  });
  await admin.from("customer_addresses").insert({
    user_id: userBId,
    recipient_name: "User B",
    line1: "9 Other St",
    city: "Otherville",
    state: "NY",
    postal_code: "10001",
    is_default: true,
  });

  // --- Rewards ledger ---
  await admin
    .from("rewards_ledger")
    .insert({ user_id: userAId, delta_points: 100, reason: "order_bonus", order_id: orderASnackId });
  await admin.from("rewards_ledger").insert({ user_id: userAId, delta_points: -20, reason: "adjustment" });
  await admin.from("rewards_ledger").insert({ user_id: userBId, delta_points: 50, reason: "order_bonus" });

  // --- Referrals: user A referred user B ---
  const { data: referralA } = await admin
    .from("referrals")
    .insert({ referrer_id: userAId, referred_id: userBId, status: "pending" })
    .select("id")
    .single();
  createdReferralIds.push(referralA!.id);
});

afterAll(async () => {
  // FK-safe order: rewards_ledger and orders reference profiles without
  // cascade (RESTRICT), so both must be cleared before the users themselves
  // are deleted - same constraint checkout-webhook-route.test.ts documents.
  // customer_addresses/customer_preferences DO cascade from profiles, so no
  // manual cleanup needed for those.
  if (userAId) await admin.from("rewards_ledger").delete().eq("user_id", userAId);
  if (userBId) await admin.from("rewards_ledger").delete().eq("user_id", userBId);

  for (const orderId of createdOrderIds) {
    await admin.from("orders").delete().eq("id", orderId);
  }
  for (const subscriptionId of createdSubscriptionIds) {
    await admin.from("subscriptions").delete().eq("id", subscriptionId);
  }
  for (const referralId of createdReferralIds) {
    await admin.from("referrals").delete().eq("id", referralId);
  }

  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
});

describe("getOrdersForUser", () => {
  it("returns only the authenticated user's own orders", async () => {
    const ordersA = await getOrdersForUser(userAId);
    const idsA = ordersA.map((o) => o.id);
    expect(idsA).toContain(orderASnackId);
    expect(idsA).toContain(orderABuildABoxId);
    expect(idsA).not.toContain(orderBId);

    const ordersB = await getOrdersForUser(userBId);
    const idsB = ordersB.map((o) => o.id);
    expect(idsB).toContain(orderBId);
    expect(idsB).not.toContain(orderASnackId);
    expect(idsB).not.toContain(orderABuildABoxId);
  });

  it("reports the correct item count per order", async () => {
    const ordersA = await getOrdersForUser(userAId);
    const snackOrder = ordersA.find((o) => o.id === orderASnackId);
    expect(snackOrder?.itemCount).toBe(1);
  });
});

describe("getOrderDetail", () => {
  it("returns full detail (status, total, line items) for the order's owner", async () => {
    const detail = await getOrderDetail(orderASnackId, userAId);
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe("paid");
    expect(detail!.totalAmountCents).toBe(1000);
    expect(detail!.items).toHaveLength(1);
    expect(detail!.items[0]!.itemType).toBe("snack");
    expect(detail!.items[0]!.quantity).toBe(2);
  });

  it("includes build-a-box snack selections when the order item is a build-a-box", async () => {
    const detail = await getOrderDetail(orderABuildABoxId, userAId);
    expect(detail).not.toBeNull();
    expect(detail!.items).toHaveLength(1);
    expect(detail!.items[0]!.snackSelections).toHaveLength(byoSnackIds.length);
  });

  it("returns null (not another user's data) for a cross-user request - this becomes a 404, never a 403", async () => {
    const detail = await getOrderDetail(orderBId, userAId);
    expect(detail).toBeNull();
  });

  it("returns null for a nonexistent order id", async () => {
    const detail = await getOrderDetail(crypto.randomUUID(), userAId);
    expect(detail).toBeNull();
  });
});

describe("getSubscriptionsForUser", () => {
  it("returns only the authenticated user's own subscriptions", async () => {
    const subsA = await getSubscriptionsForUser(userAId);
    expect(subsA.some((s) => s.stripeSubscriptionId?.startsWith("sub_test_a_"))).toBe(true);
    expect(subsA.some((s) => s.stripeSubscriptionId?.startsWith("sub_test_b_"))).toBe(false);
  });
});

describe("getPreferences", () => {
  it("returns the authenticated user's own preferences", async () => {
    const prefs = await getPreferences(userAId);
    expect(prefs).not.toBeNull();
    expect(prefs!.dietaryRestrictions).toEqual(["nut-free"]);
    expect(prefs!.marketingOptIn).toBe(false);
  });

  it("returns null (not another user's row) for a user with no preferences row yet", async () => {
    const prefs = await getPreferences(userBId);
    expect(prefs).toBeNull();
  });
});

describe("getAddresses", () => {
  it("returns only the authenticated user's own active addresses, excluding soft-deleted ones", async () => {
    const addressesA = await getAddresses(userAId);
    expect(addressesA).toHaveLength(1);
    expect(addressesA[0]!.recipientName).toBe("User A");
    expect(addressesA[0]!.isDefault).toBe(true);

    const addressesB = await getAddresses(userBId);
    expect(addressesB).toHaveLength(1);
    expect(addressesB[0]!.recipientName).toBe("User B");
  });
});

describe("getRewardsLedger", () => {
  it("returns only the authenticated user's own ledger entries", async () => {
    const ledgerA = await getRewardsLedger(userAId);
    expect(ledgerA).toHaveLength(2);
    expect(ledgerA.map((e) => e.deltaPoints).sort()).toEqual([-20, 100]);

    const ledgerB = await getRewardsLedger(userBId);
    expect(ledgerB).toHaveLength(1);
    expect(ledgerB[0]!.deltaPoints).toBe(50);
  });
});

describe("getReferralsForUser", () => {
  it("returns the referrals the authenticated user made as referrer", async () => {
    const referralsA = await getReferralsForUser(userAId);
    expect(referralsA).toHaveLength(1);
    expect(referralsA[0]!.status).toBe("pending");
  });

  it("returns an empty list for a user who hasn't referred anyone (being referred doesn't count)", async () => {
    const referralsB = await getReferralsForUser(userBId);
    expect(referralsB).toHaveLength(0);
  });
});
