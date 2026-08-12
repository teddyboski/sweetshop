import { NextRequest, NextResponse } from "next/server";
import { getOrderByPaymentIntentId } from "@/lib/supabase/queries/orders";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

/**
 * Milestone 13 (mobile): order confirmation screen after a native Payment
 * Sheet purchase. The webhook that actually creates the order
 * (payment_intent.succeeded, see webhooks/stripe/route.ts's
 * handlePaymentIntentSucceeded) is asynchronous and can arrive after
 * presentPaymentSheet() already resolved on-device - an immediate lookup
 * can legitimately find nothing yet. `status: "pending"` (not a 404) is the
 * expected response in that window; the mobile screen polls this endpoint
 * rather than treating a miss as an error - same "webhook is the source of
 * truth, the UI just catches up" pattern the web checkout success page's
 * own header comment documents.
 *
 * No auth check here on purpose - see getOrderByPaymentIntentId's header
 * comment for the security reasoning (the PaymentIntent id itself is the
 * credential, same trust model as the web success page's session_id). The
 * `checkout` rate-limit tier (30/min/IP, not the more generous 300/min
 * `catalog` tier) is used specifically because this endpoint has no auth
 * gate - it bounds how fast an attacker could enumerate PaymentIntent ids
 * even though guessing one isn't realistically feasible.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ paymentIntentId: string }> }) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.checkout);
  if (rateLimitResponse) return rateLimitResponse;

  const { paymentIntentId } = await params;
  if (!paymentIntentId.startsWith("pi_")) {
    return NextResponse.json({ data: null, error: { message: "Invalid payment intent id" } }, { status: 400 });
  }

  try {
    const order = await getOrderByPaymentIntentId(paymentIntentId);
    return NextResponse.json({ data: { status: order ? "ready" : "pending", order }, error: null }, { status: 200 });
  } catch {
    return NextResponse.json({ data: null, error: { message: "Could not load order" } }, { status: 500 });
  }
}
