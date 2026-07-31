import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createDropSchema } from "@/lib/validations/admin-promotions";

const DROP_COLUMNS = "id, box_id, starts_at, ends_at, quantity_limit, units_sold, created_at, updated_at";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createDropSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: drop, error } = await admin
    .from("drops")
    .insert({
      box_id: input.boxId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      quantity_limit: input.quantityLimit,
    })
    .select(DROP_COLUMNS)
    .single();

  if (error || !drop) {
    return NextResponse.json({ data: null, error: error?.message ?? "Could not create drop" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "drop_create",
    entity_type: "drops",
    entity_id: drop.id,
    before: null,
    after: drop,
  });

  return NextResponse.json({ data: drop, error: null }, { status: 201 });
}
