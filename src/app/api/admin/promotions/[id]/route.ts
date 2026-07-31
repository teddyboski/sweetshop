import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { updatePromotionSchema } from "@/lib/validations/admin-promotions";
import type { Database } from "@/types/supabase";

type PromotionUpdate = Database["public"]["Tables"]["promotions"]["Update"];

const PROMOTION_COLUMNS = "id, code, discount_type, value, usage_limit, used_count, expires_at, created_at, updated_at";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updatePromotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin
    .from("promotions")
    .select(PROMOTION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Promotion not found" }, { status: 404 });
  }

  const updates: PromotionUpdate = { updated_at: new Date().toISOString() };
  if (input.discountType !== undefined) updates.discount_type = input.discountType;
  if (input.value !== undefined) updates.value = input.value;
  if (input.usageLimit !== undefined) updates.usage_limit = input.usageLimit;
  if (input.expiresAt !== undefined) updates.expires_at = input.expiresAt;

  const { data: after, error: updateError } = await admin
    .from("promotions")
    .update(updates)
    .eq("id", id)
    .select(PROMOTION_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "promotion_update",
    entity_type: "promotions",
    entity_id: id,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
