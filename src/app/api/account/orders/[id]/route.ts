import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";
import { getOrderDetail } from "@/lib/supabase/queries/account";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 14 (mobile): mirrors src/app/(account)/account/orders/[id]/page.tsx
 * exactly, including its ownership-check behavior - getOrderDetail returns
 * null for both "no such order" and "belongs to someone else," which this
 * turns into a 404 either way, never a 403, so a guessed id never confirms
 * it exists in someone else's account (same pattern as
 * loadOwnedCartItem/getOrderDetail's own header comment).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.catalog);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }

  const { id } = await params;

  try {
    const order = await getOrderDetail(id, authResult.user.id);
    if (!order) {
      return NextResponse.json({ data: null, error: { message: "Order not found" } }, { status: 404 });
    }
    return NextResponse.json({ data: order, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load order" } }, { status: 500 });
  }
}
