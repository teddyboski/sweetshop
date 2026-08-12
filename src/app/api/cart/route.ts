import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveExistingCartId } from "@/lib/cart/resolve-cart";
import { getCartContents } from "@/lib/supabase/queries/cart";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 13 (mobile): no read route for cart contents existed before
 * this - the web cart page reads it directly in a Server Component via
 * resolveCartIdForPage()/getCartContents(), which only works with
 * next/headers' request-scoped cookies(), unreachable from a mobile
 * client. Same gap-closing pattern as Milestone 12's /api/catalog/* -
 * this wraps the exact same getCartContents() the web page already uses,
 * so line items and totals are identical by construction, not by
 * re-implementation.
 *
 * Deliberately does NOT create a cart as a side effect of reading one
 * (resolveExistingCartId, not resolveCartId) - an empty/no-cart response
 * is a perfectly normal "nothing added yet" state, not an error.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const admin = createAdminSupabaseClient();
  const cartResult = await resolveExistingCartId(request, admin);
  if (cartResult.error) {
    return NextResponse.json({ data: null, error: { message: cartResult.error } }, { status: cartResult.status! });
  }

  if (!cartResult.cartId) {
    return NextResponse.json(
      {
        data: {
          cartId: null,
          lines: [],
          total: { subtotalCents: 0, shippingCents: 0, totalCents: 0, hasBox: false },
          anonymousCartId: cartResult.anonymousCartId ?? null,
        },
        error: null,
      },
      { status: 200 }
    );
  }

  try {
    const contents = await getCartContents(cartResult.cartId);
    return NextResponse.json(
      { data: { ...contents, anonymousCartId: cartResult.anonymousCartId ?? null }, error: null },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load cart" } }, { status: 500 });
  }
}
