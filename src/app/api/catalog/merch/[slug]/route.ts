import { NextRequest, NextResponse } from "next/server";
import { getMerchItemBySlug } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/** Milestone 16: mirrors /api/catalog/snacks/[slug] - includes the item's variants for the picker. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const { slug } = await params;

  try {
    const merchItem = await getMerchItemBySlug(slug);
    if (!merchItem) {
      return NextResponse.json({ data: null, error: { message: "Item not found" } }, { status: 404 });
    }
    return NextResponse.json({ data: merchItem, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load item" } }, { status: 500 });
  }
}
