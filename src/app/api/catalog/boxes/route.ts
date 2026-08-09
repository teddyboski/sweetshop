import { NextRequest, NextResponse } from "next/server";
import { getActiveBoxes } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 12 (mobile): read-only mirror of what (shop)/shop/page.tsx
 * already renders server-side via getActiveBoxes() - no new business
 * logic, just an API surface the mobile app can call. Public/unauthenticated
 * on purpose, same as the web page it mirrors (no session required to
 * browse the catalog). No query params - boxes have no category/tag column,
 * same reason the web shop page only filters the snacks grid by them.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const boxes = await getActiveBoxes();
    return NextResponse.json({ data: boxes, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load boxes" } }, { status: 500 });
  }
}
