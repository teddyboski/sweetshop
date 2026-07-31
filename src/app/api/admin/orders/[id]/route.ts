import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
