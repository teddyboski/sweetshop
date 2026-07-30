import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { updateSnackSchema } from "@/lib/validations/admin-catalog";
import type { Database } from "@/types/supabase";

type SnackUpdate = Database["public"]["Tables"]["snacks"]["Update"];

const SNACK_COLUMNS =
  "id, slug, name, brand, category, tags, price_cents, is_sellable_individually, is_byo_eligible, created_at, updated_at";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateSnackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin
    .from("snacks")
    .select(SNACK_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Snack not found" }, { status: 404 });
  }

  const updates: SnackUpdate = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.brand !== undefined) updates.brand = input.brand;
  if (input.category !== undefined) updates.category = input.category;
  if (input.tags !== undefined) updates.tags = input.tags;
  if (input.priceCents !== undefined) updates.price_cents = input.priceCents;
  if (input.isSellableIndividually !== undefined) updates.is_sellable_individually = input.isSellableIndividually;
  if (input.isByoEligible !== undefined) updates.is_byo_eligible = input.isByoEligible;

  const { data: after, error: updateError } = await admin
    .from("snacks")
    .update(updates)
    .eq("id", id)
    .select(SNACK_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "snack_update",
    entity_type: "snacks",
    entity_id: id,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
