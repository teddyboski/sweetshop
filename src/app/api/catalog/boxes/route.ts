import { NextRequest, NextResponse } from "next/server";
import { catalogQuerySchema } from "@/lib/validations/catalog";
import { getActiveBoxes } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 12 (mobile): read-only mirror of what (shop)/shop/page.tsx
 * already renders server-side via getActiveBoxes() - no new business
 * logic, just an API surface the mobile app can call. Public/unauthenticated
 * on purpose, same as the web page it mirrors (no session required to
 * browse the catalog).
 *
 * Milestone 18: boxes now have a `category` column (snack_box/candy_box/
 * mystery_box/passport_box) - accepts the same optional `category` query
 * param as /api/catalog/snacks, for the new mobile category screens.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const rawParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = catalogQuerySchema.pick({ category: true }).safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid query" } },
      { status: 400 }
    );
  }

  try {
    const boxes = await getActiveBoxes(parsed.data);
    return NextResponse.json({ data: boxes, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load boxes" } }, { status: 500 });
  }
}
