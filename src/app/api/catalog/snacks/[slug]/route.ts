import { NextRequest, NextResponse } from "next/server";
import { getSnackBySlug } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 12 (mobile): mirrors (shop)/shop/snack/[slug]/page.tsx,
 * including its not-obvious rule - is_sellable_individually is a business
 * visibility flag, not RLS/security (see that page's own comment, Milestone
 * 3 plan Product Decision #3). A BYO-only snack still exists as a row, it's
 * just not a storefront product; treated identically to a nonexistent slug
 * here too, or this route would leak it where the web page doesn't.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const { slug } = await params;

  try {
    const snack = await getSnackBySlug(slug);
    if (!snack || !snack.is_sellable_individually) {
      return NextResponse.json({ data: null, error: { message: "Snack not found" } }, { status: 404 });
    }
    return NextResponse.json({ data: snack, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load snack" } }, { status: 500 });
  }
}
