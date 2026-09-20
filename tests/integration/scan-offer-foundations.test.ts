// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const admin = createAdminSupabaseClient();

const createdPromotionIds: string[] = [];
const createdUserIds: string[] = [];

afterEach(async () => {
  for (const id of [...createdUserIds].reverse()) {
    await admin.from("referrals").delete().or(`referrer_id.eq.${id},referred_id.eq.${id}`);
    await admin.from("customer_activity").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  createdUserIds.length = 0;

  for (const id of createdPromotionIds) {
    await admin.from("promotions").delete().eq("id", id);
  }
  createdPromotionIds.length = 0;
});

async function seedPromotion(firstOrderOnly: boolean) {
  const { data, error } = await admin
    .from("promotions")
    .insert({
      code: `TESTOFFER${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      discount_type: "percent",
      value: 15,
      first_order_only: firstOrderOnly,
    })
    .select("id, code")
    .single();
  if (error || !data) throw error;
  createdPromotionIds.push(data.id);
  return data;
}

async function createUser(metadata?: Record<string, unknown>) {
  const email = `test-scan-${crypto.randomUUID()}@mailinator.com`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw error;
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signedInClient(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function signupOfferCode(userId: string) {
  const { data } = await admin.from("profiles").select("signup_offer_code").eq("id", userId).single();
  return data!.signup_offer_code;
}

describe("handle_new_user: offer capture", () => {
  it("stores the offer code when it names a first_order_only promotion, case-insensitively", async () => {
    const promotion = await seedPromotion(true);
    const user = await createUser({ offer_code: `  ${promotion.code.toLowerCase()} ` });
    expect(await signupOfferCode(user.id)).toBe(promotion.code);
  });

  it("ignores an offer code that does not exist", async () => {
    const user = await createUser({ offer_code: "NOT-A-REAL-OFFER" });
    expect(await signupOfferCode(user.id)).toBeNull();
  });

  it("ignores an offer code that names a promotion which is not first_order_only", async () => {
    const promotion = await seedPromotion(false);
    const user = await createUser({ offer_code: promotion.code });
    expect(await signupOfferCode(user.id)).toBeNull();
  });

  it("ignores an empty offer code", async () => {
    await seedPromotion(true);
    const user = await createUser({ offer_code: "" });
    expect(await signupOfferCode(user.id)).toBeNull();
  });

  it("still links a referral when an offer code is present too", async () => {
    const promotion = await seedPromotion(true);
    const referrer = await createUser();
    const { data: referrerProfile } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", referrer.id)
      .single();

    const referred = await createUser({
      referral_code: referrerProfile!.referral_code,
      offer_code: promotion.code,
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("referred_by, signup_offer_code")
      .eq("id", referred.id)
      .single();
    expect(profile!.referred_by).toBe(referrer.id);
    expect(profile!.signup_offer_code).toBe(promotion.code);

    const { data: referral } = await admin
      .from("referrals")
      .select("status")
      .eq("referrer_id", referrer.id)
      .eq("referred_id", referred.id)
      .single();
    expect(referral!.status).toBe("pending");
  });
});

describe("profiles.signup_offer_code guard", () => {
  it("does not let a customer change their own signup_offer_code", async () => {
    const promotion = await seedPromotion(true);
    const user = await createUser({ offer_code: promotion.code });
    const client = await signedInClient(user.email, user.password);

    const { error } = await client
      .from("profiles")
      .update({ signup_offer_code: "HACKED" })
      .eq("id", user.id);
    if (error) expect(error.message).toContain("signup_offer_code");

    expect(await signupOfferCode(user.id)).toBe(promotion.code);
  });
});

describe("promotion_redemptions", () => {
  it("allows only one row per (promotion, customer)", async () => {
    const promotion = await seedPromotion(true);
    const user = await createUser();

    const first = await admin
      .from("promotion_redemptions")
      .insert({ promotion_id: promotion.id, user_id: user.id });
    expect(first.error).toBeNull();

    const second = await admin
      .from("promotion_redemptions")
      .insert({ promotion_id: promotion.id, user_id: user.id });
    expect(second.error?.code).toBe("23505");
  });

  it("lets a customer read only their own rows and never write", async () => {
    const promotion = await seedPromotion(true);
    const alice = await createUser();
    const bob = await createUser();
    await admin.from("promotion_redemptions").insert([
      { promotion_id: promotion.id, user_id: alice.id },
      { promotion_id: promotion.id, user_id: bob.id },
    ]);

    const aliceClient = await signedInClient(alice.email, alice.password);
    const { data: visible } = await aliceClient.from("promotion_redemptions").select("user_id");
    expect(visible).toHaveLength(1);
    expect(visible![0].user_id).toBe(alice.id);

    const { error: insertError } = await aliceClient
      .from("promotion_redemptions")
      .insert({ promotion_id: promotion.id, user_id: alice.id });
    expect(insertError).not.toBeNull();
  });
});
