import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createSnackSchema } from "@/lib/validations/admin-catalog";

// Explicit column list rather than "*" - snacks.search_vector (Milestone 3)
// is typed unknown by the generated types, not Json-representable, and
// would fail audit_logs.before/after otherwise (same issue as boxes).
const SNACK_COLUMNS =
  "id, slug, name, brand, category, tags, price_cents, is_sellable_individually, is_byo_eligible, status, created_at, updated_at";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSnackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: snack, error } = await admin
    .from("snacks")
    .insert({
      slug: input.slug,
      name: input.name,
      brand: input.brand ?? null,
      category: input.category ?? null,
      tags: input.tags,
      price_cents: input.priceCents ?? null,
      is_sellable_individually: input.isSellableIndividually,
      is_byo_eligible: input.isByoEligible,
      status: input.status,
    })
    .select(SNACK_COLUMNS)
    .single();

  if (error || !snack) {
    return NextResponse.json({ data: null, error: error?.message ?? "Snack creation failed" }, { status: 500 });
  }

  // Every snack needs exactly one row in `inventory` to be visible/settable
  // on the Admin -> Inventory page at all - adjust_inventory's RPC only
  // UPDATEs an existing row, it never creates one. Without this, a brand
  // new snack was simply unstockable until someone ran SQL by hand.
  const { error: inventoryError } = await admin
    .from("inventory")
    .insert({ snack_id: snack.id, quantity_on_hand: input.initialQuantity });
  if (inventoryError) {
    return NextResponse.json(
      { data: null, error: `Snack created, but stock setup failed: ${inventoryError.message}` },
      { status: 500 }
    );
  }
  if (input.initialQuantity > 0) {
    await admin.from("inventory_events").insert({
      snack_id: snack.id,
      delta: input.initialQuantity,
      reason: "restock",
    });
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "snack_create",
    entity_type: "snacks",
    entity_id: snack.id,
    before: null,
    after: { ...snack, initial_quantity: input.initialQuantity },
  });

  return NextResponse.json({ data: snack, error: null }, { status: 201 });
}
