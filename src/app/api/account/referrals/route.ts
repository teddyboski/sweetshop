import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";
import { getReferralCode, getReferralsForUser } from "@/lib/supabase/queries/account";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 14 (mobile): mirrors src/app/(account)/account/referrals/page.tsx.
 * The referral link is built server-side (same
 * `${NEXT_PUBLIC_APP_URL}/signup?ref=${code}` construction the web page
 * uses) rather than handing the mobile client just the raw code - referral
 * capture only exists on the web `/signup` page (Milestone 9), there's no
 * mobile-side signup deep link in this milestone's scope, so the link this
 * returns always points at the website regardless of which platform shares
 * it.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
  if (!appUrl) {
    return NextResponse.json(
      { data: null, error: { message: "Server misconfigured: NEXT_PUBLIC_APP_URL is not set" } },
      { status: 500 }
    );
  }

  try {
    const [referralCode, referrals] = await Promise.all([
      getReferralCode(authResult.user.id),
      getReferralsForUser(authResult.user.id),
    ]);
    return NextResponse.json(
      { data: { referralCode, referralLink: `${appUrl}/signup?ref=${referralCode}`, referrals }, error: null },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load referrals" } }, { status: 500 });
  }
}
