import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const adjustInventorySchema = z.object({
  delta: z.number().int().refine((d) => d !== 0, { message: "delta must not be zero" }),
  reason: z.enum(["restock", "adjustment"]),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ snackId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { snackId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = adjustInventorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  // adjust_inventory (Task 1) is the atomic, guarded RPC - rejects a delta
  // that would make quantity_on_hand negative and writes the
  // inventory_events row in the same transaction as the stock update.
  const { error } = await admin.rpc("adjust_inventory", {
    p_snack_id: snackId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 });
  }

  const { data: inventory } = await admin
    .from("inventory")
    .select("snack_id, quantity_on_hand")
    .eq("snack_id", snackId)
    .single();

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "inventory_adjust",
    entity_type: "inventory",
    entity_id: snackId,
    before: null,
    after: { delta: parsed.data.delta, reason: parsed.data.reason, quantity_on_hand: inventory?.quantity_on_hand },
  });

  return NextResponse.json({ data: inventory, error: null }, { status: 200 });
}
