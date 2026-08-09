import { NextRequest, NextResponse } from "next/server";
import { getBoxBySlug, getBoxItems } from "@/lib/supabase/queries/catalog";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 12 (mobile): mirrors (shop)/shop/box/[slug]/page.tsx - box
 * detail plus its representative items, bundled into one response since a
 * mobile detail screen wants both in a single round trip rather than the
 * two sequential Server Component awaits the web page does. Items are
 * omitted for build_a_box boxes, same rule the web page applies (there's
 * no fixed contents list to show for those).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const { slug } = await params;

  try {
    const box = await getBoxBySlug(slug);
    if (!box) {
      return NextResponse.json({ data: null, error: { message: "Box not found" } }, { status: 404 });
    }
    const items = box.box_type !== "build_a_box" ? await getBoxItems(box.id) : [];
    return NextResponse.json({ data: { ...box, items }, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load box" } }, { status: 500 });
  }
}
