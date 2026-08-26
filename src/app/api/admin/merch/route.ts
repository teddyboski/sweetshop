import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createMerchItemSchema } from "@/lib/validations/admin-merch";

// Mirrors src/app/api/admin/snacks/route.ts exactly (explicit column list,
// { data, error } envelope, audit log) - see that route for why the column
// list is explicit rather than "*".
const MERCH_ITEM_COLUMNS = "id, slug, name, description, category, price_cents, status, created_at, updated_at";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createMerchItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: merchItem, error } = await admin
    .from("merch_items")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      price_cents: input.priceCents,
      status: input.status,
    })
    .select(MERCH_ITEM_COLUMNS)
    .single();

  if (error || !merchItem) {
    return NextResponse.json({ data: null, error: error?.message ?? "Merchandise creation failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "merch_item_create",
    entity_type: "merch_items",
    entity_id: merchItem.id,
    before: null,
    after: merchItem,
  });

  return NextResponse.json({ data: merchItem, error: null }, { status: 201 });
}
