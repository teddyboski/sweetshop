import { NextRequest, NextResponse } from "next/server";
import { getByoEligibleSnacks } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 13 (mobile): mirrors (shop)/shop/build-a-box/page.tsx's
 * getByoEligibleSnacks() call - is_byo_eligible is a distinct flag from
 * is_sellable_individually (a snack can be BYO-only, not an individual
 * storefront product), so this is deliberately separate from
 * /api/catalog/snacks rather than an extra filter param on it.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const snacks = await getByoEligibleSnacks();
    return NextResponse.json({ data: snacks, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load snacks" } }, { status: 500 });
  }
}
