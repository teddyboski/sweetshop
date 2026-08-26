import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { addBoxItemSchema } from "@/lib/validations/admin-catalog";

// Curated/mystery boxes only - box_items is a fixed, admin-curated
// composition template. build_a_box boxes never populate this table; the
// customer's own selection lives in cart_item_snacks/order_item_snacks
// instead, per this table's own migration comment.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: boxId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = addBoxItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();

  const { data: box, error: boxError } = await admin
    .from("boxes")
    .select("id, box_type")
    .eq("id", boxId)
    .is("deleted_at", null)
    .maybeSingle();
  if (boxError || !box) {
    return NextResponse.json({ data: null, error: "Box not found" }, { status: 404 });
  }
  if (box.box_type === "build_a_box") {
    return NextResponse.json(
      { data: null, error: "Build-a-box contents are chosen by the customer at checkout, not set here" },
      { status: 400 }
    );
  }

  const { data: snack, error: snackError } = await admin
    .from("snacks")
    .select("id, status")
    .eq("id", input.snackId)
    .maybeSingle();
  if (snackError || !snack) {
    return NextResponse.json({ data: null, error: "Snack not found" }, { status: 404 });
  }
  if (snack.status !== "active") {
    return NextResponse.json({ data: null, error: "Cannot add an archived snack to a box" }, { status: 400 });
  }

  const { data: after, error: insertError } = await admin
    .from("box_items")
    .insert({ box_id: boxId, snack_id: input.snackId, quantity: input.quantity })
    .select("id, snack_id, quantity, snacks(name)")
    .single();

  if (insertError || !after) {
    return NextResponse.json({ data: null, error: insertError?.message ?? "Add failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "box_item_add",
    entity_type: "box_items",
    entity_id: after.id,
    before: null,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 201 });
}
