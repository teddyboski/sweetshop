import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { updateMerchVariantSchema } from "@/lib/validations/admin-merch";
import type { Database } from "@/types/supabase";

type MerchVariantUpdate = Database["public"]["Tables"]["merch_variants"]["Update"];

const VARIANT_COLUMNS = "id, merch_item_id, size, color, sku, price_cents_override, status, created_at, updated_at";

// No DELETE here, deliberately: a variant is a real catalog identity that
// order_items/inventory_events can reference permanently, same as a snack
// or box - it must never be hard-deleted (see the merch_variants
// migration's comment). "Archive" in the admin UI is this same PATCH with
// { status: "archived" }, mirroring how snacks are "removed" via
// updateSnackSchema's status field rather than a DELETE route.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: merchItemId, variantId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateMerchVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin
    .from("merch_variants")
    .select(VARIANT_COLUMNS)
    .eq("id", variantId)
    .eq("merch_item_id", merchItemId)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Variant not found" }, { status: 404 });
  }

  const updates: MerchVariantUpdate = { updated_at: new Date().toISOString() };
  if (input.size !== undefined) updates.size = input.size;
  if (input.color !== undefined) updates.color = input.color;
  if (input.sku !== undefined) updates.sku = input.sku;
  if (input.priceCentsOverride !== undefined) updates.price_cents_override = input.priceCentsOverride;
  if (input.status !== undefined) updates.status = input.status;

  const { data: after, error: updateError } = await admin
    .from("merch_variants")
    .update(updates)
    .eq("id", variantId)
    .select(VARIANT_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: input.status === "archived" ? "merch_variant_archive" : "merch_variant_update",
    entity_type: "merch_variants",
    entity_id: variantId,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
