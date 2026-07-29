import { NextRequest, NextResponse } from "next/server";
import { updateAddressSchema } from "@/lib/validations/account";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";
import type { Database } from "@/types/supabase";

type CustomerAddressUpdate = Database["public"]["Tables"]["customer_addresses"]["Update"];

type OwnedAddressResult =
  | { ok: true; address: { id: string; user_id: string } }
  | { ok: false; error: string; status: number };

/**
 * Ownership-checked in code, not just RLS-trusted - same pattern as
 * loadOwnedCartItem in src/app/api/cart/items/[id]/route.ts (Milestone 5)
 * and getOrderDetail in queries/account.ts (Milestone 7, Task 1). A missing
 * address and one owned by someone else both return 404, never 403.
 */
async function loadOwnedAddress(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  id: string,
  userId: string
): Promise<OwnedAddressResult> {
  const { data: address, error } = await admin
    .from("customer_addresses")
    .select("id, user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!address || address.user_id !== userId) return { ok: false, error: "Address not found", status: 404 };

  return { ok: true, address };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }
  const { user } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = updateAddressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const owned = await loadOwnedAddress(admin, id, user.id);
  if (!owned.ok) {
    return NextResponse.json({ data: null, error: { message: owned.error } }, { status: owned.status });
  }

  // Same "unset the existing default first" step as POST /api/account/addresses
  // - promoting this address to default must un-default whatever was default
  // before, per the one-default-per-user unique index.
  if (parsed.data.isDefault === true) {
    await admin
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .is("deleted_at", null);
  }

  const updates: CustomerAddressUpdate = { updated_at: new Date().toISOString() };
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.recipientName !== undefined) updates.recipient_name = parsed.data.recipientName;
  if (parsed.data.line1 !== undefined) updates.line1 = parsed.data.line1;
  if (parsed.data.line2 !== undefined) updates.line2 = parsed.data.line2;
  if (parsed.data.city !== undefined) updates.city = parsed.data.city;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state;
  if (parsed.data.postalCode !== undefined) updates.postal_code = parsed.data.postalCode;
  if (parsed.data.country !== undefined) updates.country = parsed.data.country;
  if (parsed.data.isDefault !== undefined) updates.is_default = parsed.data.isDefault;

  const { data, error } = await admin
    .from("customer_addresses")
    .update(updates)
    .eq("id", id)
    .select("id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: { message: "Could not update address" } }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: {
        id: data.id,
        label: data.label,
        recipientName: data.recipient_name,
        line1: data.line1,
        line2: data.line2,
        city: data.city,
        state: data.state,
        postalCode: data.postal_code,
        country: data.country,
        isDefault: data.is_default,
      },
      error: null,
    },
    { status: 200 }
  );
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }
  const { user } = authResult;

  const admin = createAdminSupabaseClient();
  const owned = await loadOwnedAddress(admin, id, user.id);
  if (!owned.ok) {
    return NextResponse.json({ data: null, error: { message: owned.error } }, { status: owned.status });
  }

  // Soft-delete only, per the schema's own deleted_at column - never a hard
  // delete, matching orders/boxes/customers convention (CLAUDE.md's database
  // conventions). Deliberately does not auto-promote another address to
  // default (simplest solution that solves the problem - CLAUDE.md coding
  // standards); the customer can set a new default explicitly.
  const { error } = await admin
    .from("customer_addresses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ data: null, error: { message: "Could not delete address" } }, { status: 500 });
  }

  return NextResponse.json({ data: { id }, error: null }, { status: 200 });
}
