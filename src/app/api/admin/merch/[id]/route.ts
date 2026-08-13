import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { updateMerchItemSchema } from "@/lib/validations/admin-merch";
import type { Database } from "@/types/supabase";

type MerchItemUpdate = Database["public"]["Tables"]["merch_items"]["Update"];

const MERCH_ITEM_COLUMNS = "id, slug, name, description, category, price_cents, status, created_at, updated_at";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateMerchItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin
    .from("merch_items")
    .select(MERCH_ITEM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Merchandise item not found" }, { status: 404 });
  }

  const updates: MerchItemUpdate = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.category !== undefined) updates.category = input.category;
  if (input.priceCents !== undefined) updates.price_cents = input.priceCents;
  if (input.status !== undefined) updates.status = input.status;

  const { data: after, error: updateError } = await admin
    .from("merch_items")
    .update(updates)
    .eq("id", id)
    .select(MERCH_ITEM_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "merch_item_update",
    entity_type: "merch_items",
    entity_id: id,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
