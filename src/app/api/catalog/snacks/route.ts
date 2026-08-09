import { NextRequest, NextResponse } from "next/server";
import { catalogQuerySchema } from "@/lib/validations/catalog";
import { getSellableSnacks } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 12 (mobile): mirrors the snacks half of (shop)/shop/page.tsx -
 * same category/tag filters, same getSellableSnacks() query.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const rawParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = catalogQuerySchema.pick({ category: true, tag: true }).safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid query" } },
      { status: 400 }
    );
  }

  try {
    const snacks = await getSellableSnacks(parsed.data);
    return NextResponse.json({ data: snacks, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load snacks" } }, { status: 500 });
  }
}
