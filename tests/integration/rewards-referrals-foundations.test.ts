// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Milestone 9, Task 1. handle_new_user() now reads raw_user_meta_data.referral_code
// (populated the same way whether via a real supabase.auth.signUp() call or,
// as here, admin.auth.admin.createUser()'s user_metadata option - both land
// in the same auth.users.raw_user_meta_data column the trigger reads) to
// link a referral, and two new guarded RPCs (increment_promotion_used_count,
// redeem_rewards_points) are exercised directly, same pattern as
// admin-dashboard-foundations.test.ts's adjust_inventory coverage.

const admin = createAdminSupabaseClient();

const createdUserIds: string[] = [];
const createdPromotionIds: string[] = [];
const createdOrderIds: string[] = [];

afterEach(async () => {
  for (const orderId of createdOrderIds) {
    await admin.from("rewards_ledger").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  createdOrderIds.length = 0;

  for (const id of createdPromotionIds) {
    await admin.from("promotions").delete().eq("id", id);
  }
  createdPromotionIds.length = 0;

  for (const id of createdUserIds) {
    // referrals rows cascade from neither side (no ON DELETE CASCADE - see
    // the initial schema), and rewards_ledger doesn't cascade either (see
    // checkout-webhook-route.test.ts's teardown comment) - both cleared
    // explicitly before deleting the user.
    await admin.from("referrals").delete().or(`referrer_id.eq.${id},referred_id.eq.${id}`);
    await admin.from("rewards_ledger").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  createdUserIds.length = 0;
});

async function createTestUser(prefix: string, userMetadata?: Record<string, unknown>) {
  const email = `test-${prefix}-${crypto.randomUUID()}@mailinator.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (error || !data.user) throw error;
  createdUserIds.push(data.user.id);
  return data.user.id;
}

describe("handle_new_user() referral capture", () => {
  it("sets referred_by and creates a pending referrals row for a valid referral_code", async () => {
    const referrerId = await createTestUser("referrer");
    const { data: referrer } = await admin.from("profiles").select("referral_code").eq("id", referrerId).single();

    const referredId = await createTestUser("referred", { referral_code: referrer!.referral_code });

    const { data: referredProfile } = await admin.from("profiles").select("referred_by").eq("id", referredId).single();
    expect(referredProfile!.referred_by).toBe(referrerId);

    const { data: referral } = await admin
      .from("referrals")
      .select("status, referrer_id, referred_id")
      .eq("referred_id", referredId)
      .single();
    expect(referral!.status).toBe("pending");
    expect(referral!.referrer_id).toBe(referrerId);
  });

  it("is a silent no-op for an unknown referral_code - no referred_by, no referrals row, signup still succeeds", async () => {
    const referredId = await createTestUser("unknown-code", { referral_code: "not-a-real-code" });

    const { data: referredProfile } = await admin.from("profiles").select("referred_by").eq("id", referredId).single();
    expect(referredProfile!.referred_by).toBeNull();

    const { data: referral } = await admin.from("referrals").select("id").eq("referred_id", referredId).maybeSingle();
    expect(referral).toBeNull();
  });

  it("creates a normal profile with no referred_by when no referral_code metadata is present at all", async () => {
    const userId = await createTestUser("no-metadata");
    const { data: profile } = await admin.from("profiles").select("referred_by").eq("id", userId).single();
    expect(profile!.referred_by).toBeNull();
  });
});

describe("increment_promotion_used_count", () => {
  async function seedPromotion(overrides: Partial<{ usage_limit: number | null; expires_at: string | null; used_count: number }> = {}) {
    const { data, error } = await admin
      .from("promotions")
      .insert({
        code: `TEST${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        discount_type: "fixed",
        value: 500,
        usage_limit: overrides.usage_limit ?? null,
        expires_at: overrides.expires_at ?? null,
        used_count: overrides.used_count ?? 0,
      })
      .select("id")
      .single();
    if (error || !data) throw error;
    createdPromotionIds.push(data.id);
    return data.id;
  }

  it("increments used_count when under the limit and not expired", async () => {
    const promotionId = await seedPromotion({ usage_limit: 5, used_count: 2 });
    const { data: result } = await admin.rpc("increment_promotion_used_count", { p_promotion_id: promotionId });
    expect(result).toBe(true);

    const { data: promo } = await admin.from("promotions").select("used_count").eq("id", promotionId).single();
    expect(promo!.used_count).toBe(3);
  });

  it("rejects and leaves used_count unchanged once usage_limit is reached", async () => {
    const promotionId = await seedPromotion({ usage_limit: 3, used_count: 3 });
    const { data: result } = await admin.rpc("increment_promotion_used_count", { p_promotion_id: promotionId });
    expect(result).toBe(false);

    const { data: promo } = await admin.from("promotions").select("used_count").eq("id", promotionId).single();
    expect(promo!.used_count).toBe(3);
  });

  it("rejects an expired promotion", async () => {
    const promotionId = await seedPromotion({ expires_at: new Date(Date.now() - 60_000).toISOString() });
    const { data: result } = await admin.rpc("increment_promotion_used_count", { p_promotion_id: promotionId });
    expect(result).toBe(false);
  });

  it("succeeds with no usage_limit at all", async () => {
    const promotionId = await seedPromotion({ usage_limit: null });
    const { data: result } = await admin.rpc("increment_promotion_used_count", { p_promotion_id: promotionId });
    expect(result).toBe(true);
  });
});

describe("redeem_rewards_points", () => {
  it("debits the balance and writes a negative rewards_ledger row when sufficient", async () => {
    const userId = await createTestUser("redeem-ok");
    await admin.from("profiles").update({ rewards_points: 1000 }).eq("id", userId);

    const { data: result } = await admin.rpc("redeem_rewards_points", {
      p_user_id: userId,
      p_points: 300,
      p_order_id: null,
    });
    expect(result).toBe(true);

    const { data: profile } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    expect(profile!.rewards_points).toBe(700);

    const { data: ledger } = await admin
      .from("rewards_ledger")
      .select("delta_points, reason")
      .eq("user_id", userId)
      .eq("reason", "redemption")
      .single();
    expect(ledger!.delta_points).toBe(-300);
  });

  it("rejects a redemption over the current balance, writing nothing", async () => {
    const userId = await createTestUser("redeem-over");
    await admin.from("profiles").update({ rewards_points: 100 }).eq("id", userId);

    const { data: result } = await admin.rpc("redeem_rewards_points", {
      p_user_id: userId,
      p_points: 500,
      p_order_id: null,
    });
    expect(result).toBe(false);

    const { data: profile } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
    expect(profile!.rewards_points).toBe(100);

    const { data: ledger } = await admin.from("rewards_ledger").select("id").eq("user_id", userId).eq("reason", "redemption");
    expect(ledger).toHaveLength(0);
  });
});
