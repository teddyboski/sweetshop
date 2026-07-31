import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";

const ORDER_COLUMNS =
  "id, user_id, guest_email, status, total_amount_cents, tracking_number, stripe_payment_intent_id, created_at, updated_at";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const admin = createAdminSupabaseClient();

  const { data: before, error: beforeError } = await admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Order not found" }, { status: 404 });
  }

  if (before.status === "refunded") {
    return NextResponse.json({ data: null, error: "Order is already refunded" }, { status: 400 });
  }

  // Subscription-renewal orders (created from Stripe invoice.paid, see the
  // webhook handler) deliberately have no payment_intent recorded - this
  // SDK version exposes it only via the paginated invoice.payments
  // sub-resource, which Decision #1 scoped out of Milestone 8. Refunding
  // those isn't supported yet.
  if (!before.stripe_payment_intent_id) {
    return NextResponse.json(
      { data: null, error: "This order has no payment intent on file and cannot be refunded here" },
      { status: 400 }
    );
  }

  const stripe = createStripeClient();
  try {
    await stripe.refunds.create({ payment_intent: before.stripe_payment_intent_id });
  } catch (stripeError) {
    const message = stripeError instanceof Error ? stripeError.message : "Stripe refund failed";
    return NextResponse.json({ data: null, error: message }, { status: 502 });
  }

  const { data: after, error: updateError } = await admin
    .from("orders")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(ORDER_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json(
      { data: null, error: "Stripe refund succeeded but updating the order failed - check Stripe dashboard" },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "order_refund",
    entity_type: "orders",
    entity_id: id,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
