import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendExpoPushNotifications } from "@/lib/push/send";
import type { Database } from "@/types/supabase";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

const ORDER_COLUMNS =
  "id, user_id, guest_email, status, total_amount_cents, tracking_number, stripe_payment_intent_id, created_at, updated_at";

const updateOrderSchema = z.object({
  status: z.enum(["fulfilled", "shipped", "cancelled"]).optional(),
  trackingNumber: z.string().trim().min(1).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

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

  if (input.status === "fulfilled" && !(input.trackingNumber ?? before.tracking_number)) {
    return NextResponse.json(
      { data: null, error: "trackingNumber is required to mark an order fulfilled" },
      { status: 400 }
    );
  }

  const updates: OrderUpdate = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) updates.status = input.status;
  if (input.trackingNumber !== undefined) updates.tracking_number = input.trackingNumber;

  const { data: after, error: updateError } = await admin
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select(ORDER_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "order_update",
    entity_type: "orders",
    entity_id: id,
    before,
    after,
  });

  // Milestone 14 (mobile), Task 8: push trigger, added alongside the
  // audit_logs write above rather than as a new admin feature (per the
  // plan doc). Guarded on before.status !== "shipped" so a redundant PATCH
  // (e.g. re-submitting the same status) never re-sends. Guest orders have
  // no user_id and therefore no possible push_tokens row - the lookup
  // naturally returns nothing, no special-casing needed.
  if (after.status === "shipped" && before.status !== "shipped" && after.user_id) {
    const { data: tokens } = await admin.from("push_tokens").select("expo_push_token").eq("user_id", after.user_id);
    if (tokens && tokens.length > 0) {
      await sendExpoPushNotifications(
        tokens.map((t) => ({
          to: t.expo_push_token,
          title: "Your order has shipped!",
          body: `Order #${after.id.slice(0, 8)} is on its way.`,
          data: { type: "order_shipped", orderId: after.id },
        }))
      );
    }
  }

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
