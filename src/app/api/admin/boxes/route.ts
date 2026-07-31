import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createBoxSchema } from "@/lib/validations/admin-catalog";

// Explicit column list rather than "*" - boxes.search_vector (Milestone 3's
// full-text search column) is typed `unknown` by the generated types (a
// Postgres tsvector, not JSON-representable), which fails to satisfy
// audit_logs.before/after's Json column type if selected.
const BOX_COLUMNS =
  "id, slug, title, description, price_cents, is_subscription, cadence, box_type, slot_count, status, created_at, updated_at, deleted_at";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createBoxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: box, error } = await admin
    .from("boxes")
    .insert({
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      price_cents: input.priceCents,
      is_subscription: input.isSubscription,
      cadence: input.cadence ?? null,
      box_type: input.boxType,
      slot_count: input.slotCount ?? null,
      status: input.status,
    })
    .select(BOX_COLUMNS)
    .single();

  if (error || !box) {
    return NextResponse.json({ data: null, error: error?.message ?? "Box creation failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "box_create",
    entity_type: "boxes",
    entity_id: box.id,
    before: null,
    after: box,
  });

  return NextResponse.json({ data: box, error: null }, { status: 201 });
}
