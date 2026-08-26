import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createMerchVariantSchema } from "@/lib/validations/admin-merch";

const VARIANT_COLUMNS = "id, merch_item_id, size, color, sku, price_cents_override, status, created_at, updated_at";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: merchItemId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createMerchVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();

  const { data: merchItem, error: merchItemError } = await admin
    .from("merch_items")
    .select("id")
    .eq("id", merchItemId)
    .maybeSingle();
  if (merchItemError || !merchItem) {
    return NextResponse.json({ data: null, error: "Merchandise item not found" }, { status: 404 });
  }

  const { data: variant, error } = await admin
    .from("merch_variants")
    .insert({
      merch_item_id: merchItemId,
      size: input.size ?? null,
      color: input.color ?? null,
      sku: input.sku ?? null,
      price_cents_override: input.priceCentsOverride ?? null,
    })
    .select(VARIANT_COLUMNS)
    .single();

  if (error || !variant) {
    return NextResponse.json({ data: null, error: error?.message ?? "Variant creation failed" }, { status: 500 });
  }

  // Same gap Ted flagged for snacks (2026-08-12, see createMerchVariantSchema's
  // comment): every variant needs exactly one merch_inventory row to be
  // visible/settable on Admin -> Inventory at all - adjust_merch_inventory's
  // RPC only UPDATEs an existing row, it never creates one.
  const { error: inventoryError } = await admin
    .from("merch_inventory")
    .insert({ merch_variant_id: variant.id, quantity_on_hand: input.initialQuantity });
  if (inventoryError) {
    return NextResponse.json(
      { data: null, error: `Variant created, but stock setup failed: ${inventoryError.message}` },
      { status: 500 }
    );
  }
  if (input.initialQuantity > 0) {
    await admin.from("merch_inventory_events").insert({
      merch_variant_id: variant.id,
      delta: input.initialQuantity,
      reason: "restock",
    });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "merch_variant_add",
    entity_type: "merch_variants",
    entity_id: variant.id,
    before: null,
    after: { ...variant, initial_quantity: input.initialQuantity },
  });

  return NextResponse.json({ data: variant, error: null }, { status: 201 });
}
