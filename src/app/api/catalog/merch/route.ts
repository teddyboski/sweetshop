import { NextRequest, NextResponse } from "next/server";
import { catalogQuerySchema } from "@/lib/validations/catalog";
import { getMerchItems } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/** Milestone 16: mirrors /api/catalog/snacks - same shape, mobile-ready public read. */
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
    const merchItems = await getMerchItems(parsed.data);
    return NextResponse.json({ data: merchItems, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load merchandise" } }, { status: 500 });
  }
}
