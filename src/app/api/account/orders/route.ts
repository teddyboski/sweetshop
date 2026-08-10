import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";
import { getOrdersForUser } from "@/lib/supabase/queries/account";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 14 (mobile): closes the same gap shape Milestone 12 closed for
 * catalog and Milestone 13 closed for cart - web reads this via
 * getOrdersForUser() directly inside a Server Component
 * (src/app/(account)/account/orders/page.tsx), which only works with
 * next/headers' request-scoped cookies(), unreachable from a mobile client.
 * This wraps the exact same query function, so results are identical by
 * construction, not by re-implementation.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }

  try {
    const orders = await getOrdersForUser(authResult.user.id);
    return NextResponse.json({ data: orders, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load orders" } }, { status: 500 });
  }
}
