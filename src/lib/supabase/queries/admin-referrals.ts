import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export interface ReferralRow {
  id: string;
  referrerEmail: string | null;
  referredEmail: string | null;
  status: string;
  rewardIssuedAt: string | null;
  createdAt: string;
}

/**
 * Read-only - referral creation is Milestone 9's job (Ground Truth: nothing
 * writes to this table anywhere in Milestones 2-8 yet). This will render
 * zero rows until then, which is expected, not a bug.
 */
export async function listReferrals(): Promise<ReferralRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("referrals")
    .select(
      "id, status, reward_issued_at, created_at, referrer:profiles!referrals_referrer_id_fkey(email), referred:profiles!referrals_referred_id_fkey(email)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    referrerEmail: row.referrer?.email ?? null,
    referredEmail: row.referred?.email ?? null,
    status: row.status,
    rewardIssuedAt: row.reward_issued_at,
    createdAt: row.created_at,
  }));
}
