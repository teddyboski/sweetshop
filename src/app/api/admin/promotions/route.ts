import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createPromotionSchema } from "@/lib/validations/admin-promotions";

const PROMOTION_COLUMNS = "id, code, discount_type, value, usage_limit, used_count, expires_at, created_at, updated_at";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createPromotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: promotion, error } = await admin
    .from("promotions")
    .insert({
      code: input.code,
      discount_type: input.discountType,
      value: input.value,
      usage_limit: input.usageLimit ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select(PROMOTION_COLUMNS)
    .single();

  if (error || !promotion) {
    return NextResponse.json({ data: null, error: error?.message ?? "Could not create promotion" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "promotion_create",
    entity_type: "promotions",
    entity_id: promotion.id,
    before: null,
    after: promotion,
  });

  return NextResponse.json({ data: promotion, error: null }, { status: 201 });
}
