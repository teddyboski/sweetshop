import { NextRequest, NextResponse } from "next/server";
import { getSnackBySlug } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/** Milestone 12 (mobile): mirrors (shop)/shop/snack/[slug]/page.tsx. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const { slug } = await params;

  try {
    const snack = await getSnackBySlug(slug);
    if (!snack) {
      return NextResponse.json({ data: null, error: { message: "Snack not found" } }, { status: 404 });
    }
    return NextResponse.json({ data: snack, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load snack" } }, { status: 500 });
  }
}
