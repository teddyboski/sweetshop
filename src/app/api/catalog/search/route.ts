import { NextRequest, NextResponse } from "next/server";
import { catalogQuerySchema } from "@/lib/validations/catalog";
import { searchCatalog } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 12 (mobile): mirrors the query.q branch of (shop)/shop/page.tsx
 * - same searchCatalog() call against the same search_vector full-text
 * index, so results match web's search exactly for an identical query
 * (Milestone 12 completion criterion).
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const rawParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = catalogQuerySchema.pick({ q: true }).safeParse(rawParams);
  if (!parsed.success || !parsed.data.q) {
    return NextResponse.json(
      { data: null, error: { message: parsed.success ? "q is required" : parsed.error.issues[0]?.message } },
      { status: 400 }
    );
  }

  try {
    const results = await searchCatalog(parsed.data.q);
    return NextResponse.json({ data: results, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Search failed" } }, { status: 500 });
  }
}
