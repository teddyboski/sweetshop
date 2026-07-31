import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { updateDropSchema } from "@/lib/validations/admin-promotions";
import type { Database } from "@/types/supabase";

type DropUpdate = Database["public"]["Tables"]["drops"]["Update"];

const DROP_COLUMNS = "id, box_id, starts_at, ends_at, quantity_limit, units_sold, created_at, updated_at";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateDropSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await admin.from("drops").select(DROP_COLUMNS).eq("id", id).maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ data: null, error: "Drop not found" }, { status: 404 });
  }

  const nextStartsAt = input.startsAt ?? before.starts_at;
  const nextEndsAt = input.endsAt ?? before.ends_at;
  if (new Date(nextEndsAt) <= new Date(nextStartsAt)) {
    return NextResponse.json({ data: null, error: "endsAt must be after startsAt" }, { status: 400 });
  }

  const updates: DropUpdate = { updated_at: new Date().toISOString() };
  if (input.startsAt !== undefined) updates.starts_at = input.startsAt;
  if (input.endsAt !== undefined) updates.ends_at = input.endsAt;
  if (input.quantityLimit !== undefined) updates.quantity_limit = input.quantityLimit;

  const { data: after, error: updateError } = await admin
    .from("drops")
    .update(updates)
    .eq("id", id)
    .select(DROP_COLUMNS)
    .single();

  if (updateError || !after) {
    return NextResponse.json({ data: null, error: updateError?.message ?? "Update failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "drop_update",
    entity_type: "drops",
    entity_id: id,
    before,
    after,
  });

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
