import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { updateBoxSchema } from "@/lib/validations/admin-catalog";
import type { Database } from "@/types/supabase";

type BoxUpdate = Database["public"]["Tables"]["boxes"]["Update"];

// Explicit column list rather than "*" - boxes.search_vector (Milestone 3's
// full-text search column) is typed `unknown` by the generated types (a
// Postgres tsvector, not JSON-representable), which fails to satisfy
// audit_logs.before/after's Json column type if selected.
const BOX_COLUMNS =
  "id, slug, title, description, price_cents, is_subscription, cadence, box_type, category, slot_count, status, created_at, updated_at, deleted_at";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateBoxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin.from("boxes").select(BOX_COLUMNS).eq("id", id).maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Box not found" }, { status: 404 });
  }

  const updates: BoxUpdate = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.priceCents !== undefined) updates.price_cents = input.priceCents;
  if (input.isSubscription !== undefined) updates.is_subscription = input.isSubscription;
  if (input.cadence !== undefined) updates.cadence = input.cadence;
  if (input.boxType !== undefined) updates.box_type = input.boxType;
  if (input.category !== undefined) updates.category = input.category;
  if (input.slotCount !== undefined) updates.slot_count = input.slotCount;
  if (input.status !== undefined) updates.status = input.status;

  const { data: after, error: updateError } = await admin
    .from("boxes")
    .update(updates)
    .eq("id", id)
    .select(BOX_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "box_update",
    entity_type: "boxes",
    entity_id: id,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin.from("boxes").select(BOX_COLUMNS).eq("id", id).maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Box not found" }, { status: 404 });
  }

  // Soft delete via deleted_at - never a hard delete, per CLAUDE.md.
  const { data: after, error: deleteError } = await admin
    .from("boxes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select(BOX_COLUMNS)
    .single();

  if (deleteError || !after) {
    return NextResponse.json({ data: null, error: deleteError?.message ?? "Delete failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "box_delete",
    entity_type: "boxes",
    entity_id: id,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
