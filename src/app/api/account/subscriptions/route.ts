import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";
import { getSubscriptionsForUser } from "@/lib/supabase/queries/account";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 14 (mobile): wraps getSubscriptionsForUser, the same query
 * src/app/(account)/account/subscriptions/page.tsx already uses. Portal
 * session creation for pause/cancel already exists at
 * POST /api/account/subscriptions/portal-session and is already mobile-
 * ready (bearer-token auth) - this route is purely additive, the read half
 * that route never needed.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }

  try {
    const subscriptions = await getSubscriptionsForUser(authResult.user.id);
    return NextResponse.json({ data: subscriptions, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load subscriptions" } }, { status: 500 });
  }
}
