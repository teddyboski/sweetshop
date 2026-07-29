// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getReferralCode, getReferralsForUser } from "@/lib/supabase/queries/account";

// getReferralsForUser's cross-user scoping (referrer sees their referral,
// the referred party doesn't) is already covered by account-queries.test.ts
// (Milestone 7, Task 1). This file adds the one thing that wasn't tested
// yet: getReferralCode, added for Task 6's shareable-link page.
const admin = createAdminSupabaseClient();

let userId: string;
const email = `test-referral-code-${crypto.randomUUID()}@mailinator.com`;

beforeAll(async () => {
  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !user.user) throw error;
  userId = user.user.id;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("getReferralCode", () => {
  it("returns the user's actual profiles.referral_code, not a generated placeholder", async () => {
    const { data: profile } = await admin.from("profiles").select("referral_code").eq("id", userId).single();
    const code = await getReferralCode(userId);
    expect(code).toBe(profile!.referral_code);
    expect(code).toMatch(/^[0-9a-f]{12}$/); // encode(gen_random_bytes(6), 'hex')
  });
});

describe("getReferralsForUser", () => {
  it("returns an empty list for a brand-new user who has neither referred nor been referred", async () => {
    const referrals = await getReferralsForUser(userId);
    expect(referrals).toHaveLength(0);
  });
});
