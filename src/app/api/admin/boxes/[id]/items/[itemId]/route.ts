import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { updateBoxItemSchema } from "@/lib/validations/admin-catalog";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: boxId, itemId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateBoxItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin
    .from("box_items")
    .select("id, snack_id, quantity")
    .eq("id", itemId)
    .eq("box_id", boxId)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Box item not found" }, { status: 404 });
  }

  const { data: after, error: updateError } = await admin
    .from("box_items")
    .update({ quantity: parsed.data.quantity })
    .eq("id", itemId)
    .select("id, snack_id, quantity, snacks(name)")
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "box_item_update",
    entity_type: "box_items",
    entity_id: itemId,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: boxId, itemId } = await params;
  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin
    .from("box_items")
    .select("id, snack_id, quantity")
    .eq("id", itemId)
    .eq("box_id", boxId)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Box item not found" }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("box_items").delete().eq("id", itemId);
  if (deleteError) {
    return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "box_item_remove",
    entity_type: "box_items",
    entity_id: itemId,
    before,
    after: null,
  });

  return NextResponse.json({ data: { id: itemId }, error: null }, { status: 200 });
}
