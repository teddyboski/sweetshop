import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const adjustRewardsSchema = z.object({
  userId: z.string().uuid(),
  deltaPoints: z.number().int().refine((n) => n !== 0, "deltaPoints must be non-zero"),
});

/**
 * Reuses credit_rewards_points (Milestone 6) directly rather than a
 * duplicate RPC - it already does the ledger insert + profiles.rewards_points
 * update atomically, which is exactly what a manual admin adjustment also
 * needs. p_order_id is null (this isn't tied to a specific order) and
 * p_reason is a fixed 'admin_adjustment' string, distinct from
 * 'order_placed'/'subscription_renewal' so the ledger can tell them apart -
 * see Ground Truth correction in the Milestone 8 plan doc.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = adjustRewardsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { userId, deltaPoints } = parsed.data;

  const admin = createAdminSupabaseClient();

  const { data: before, error: beforeError } = await admin
    .from("profiles")
    .select("id, email, rewards_points")
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Customer not found" }, { status: 404 });
  }

  const { error: rpcError } = await admin.rpc("credit_rewards_points", {
    p_user_id: userId,
    p_delta_points: deltaPoints,
    p_reason: "admin_adjustment",
    p_order_id: null,
  });
  if (rpcError) {
    return NextResponse.json({ data: null, error: rpcError.message }, { status: 500 });
  }

  const { data: after } = await admin.from("profiles").select("id, email, rewards_points").eq("id", userId).single();

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "rewards_adjust",
    entity_type: "profiles",
    entity_id: userId,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
