// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { listReferrals } from "@/lib/supabase/queries/admin-referrals";

// Milestone 8, Task 10. Referral creation is Milestone 9's job (Ground
// Truth - nothing writes to this table yet), so in production this page
// renders zero rows today; that's covered by simply not throwing on an
// empty table (exercised implicitly by every other test file's calls into
// a live, shared project). This test instead proves the query's joins are
// correct once a row does exist, by seeding one directly.

const admin = createAdminSupabaseClient();
const createdUserIds: string[] = [];
const createdReferralIds: string[] = [];

afterEach(async () => {
  for (const id of createdReferralIds) {
    await admin.from("referrals").delete().eq("id", id);
  }
  createdReferralIds.length = 0;
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
  createdUserIds.length = 0;
});

async function createTestUser(prefix: string) {
  const email = `test-${prefix}-${crypto.randomUUID()}@mailinator.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true });
  if (error || !data.user) throw error;
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

describe("listReferrals", () => {
  it("joins referrer and referred emails correctly for a hand-seeded row", async () => {
    const referrer = await createTestUser("referrer");
    const referred = await createTestUser("referred");

    const { data: referral } = await admin
      .from("referrals")
      .insert({ referrer_id: referrer.id, referred_id: referred.id, status: "pending" })
      .select("id")
      .single();
    createdReferralIds.push(referral!.id);

    const referrals = await listReferrals();
    const match = referrals.find((r) => r.id === referral!.id);
    expect(match).toBeTruthy();
    expect(match!.referrerEmail).toBe(referrer.email);
    expect(match!.referredEmail).toBe(referred.email);
    expect(match!.status).toBe("pending");
  });
});
