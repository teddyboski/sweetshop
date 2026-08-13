import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Mirrors /api/admin/inventory/[snackId]/adjust exactly, against
// adjust_merch_inventory instead of adjust_inventory.
const adjustMerchInventorySchema = z.object({
  delta: z.number().int().refine((d) => d !== 0, { message: "delta must not be zero" }),
  reason: z.enum(["restock", "adjustment"]),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { variantId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = adjustMerchInventorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("adjust_merch_inventory", {
    p_merch_variant_id: variantId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 });
  }

  const { data: inventory } = await admin
    .from("merch_inventory")
    .select("merch_variant_id, quantity_on_hand")
    .eq("merch_variant_id", variantId)
    .single();

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "merch_inventory_adjust",
    entity_type: "merch_inventory",
    entity_id: variantId,
    before: null,
    after: { delta: parsed.data.delta, reason: parsed.data.reason, quantity_on_hand: inventory?.quantity_on_hand },
  });

  return NextResponse.json({ data: inventory, error: null }, { status: 200 });
}
