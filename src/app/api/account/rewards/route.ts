import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";
import { getRewardsBalance, getRewardsLedger } from "@/lib/supabase/queries/account";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 14 (mobile): mirrors src/app/(account)/account/rewards/page.tsx,
 * which reads both the cached balance and the full ledger for one page -
 * bundled into a single response here for the same reason (one screen,
 * one round trip), rather than two separate routes.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }

  try {
    const [balance, ledger] = await Promise.all([
      getRewardsBalance(authResult.user.id),
      getRewardsLedger(authResult.user.id),
    ]);
    return NextResponse.json({ data: { balance, ledger }, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load rewards" } }, { status: 500 });
  }
}
