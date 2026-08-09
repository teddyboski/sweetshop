import { NextRequest, NextResponse } from "next/server";
import { getActiveDrops } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 12 (mobile): new listing endpoint - see getActiveDrops()'s own
 * comment in queries/catalog.ts for why this has no web-side page to
 * mirror. Returns drops that haven't ended yet, including not-yet-started
 * ones; the client decides per-row whether to show a countdown-to-start,
 * a live countdown-to-end, or a sold-out state.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const drops = await getActiveDrops();
    return NextResponse.json({ data: drops, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load drops" } }, { status: 500 });
  }
}
