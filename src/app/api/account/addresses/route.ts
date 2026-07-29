import { NextRequest, NextResponse } from "next/server";
import { createAddressSchema } from "@/lib/validations/account";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";

export async function POST(request: NextRequest) {
  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }
  const { user } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = createAddressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  // The unique index (one default per user among non-deleted rows) means
  // inserting a second is_default=true row would fail outright - unset the
  // existing default first, mirroring how the PATCH route below promotes a
  // different address to default. No explicit DB transaction wraps these two
  // calls (this codebase's established V1 simplification, same as the
  // checkout webhook's sequential admin calls) - an accepted small race
  // window, not a scenario justifying transaction plumbing for a first cut.
  if (parsed.data.isDefault) {
    await admin
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .is("deleted_at", null);
  }

  const { data, error } = await admin
    .from("customer_addresses")
    .insert({
      user_id: user.id,
      label: parsed.data.label ?? null,
      recipient_name: parsed.data.recipientName,
      line1: parsed.data.line1,
      line2: parsed.data.line2 ?? null,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postalCode,
      country: parsed.data.country,
      is_default: parsed.data.isDefault,
    })
    .select("id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: { message: "Could not save address" } }, { status: 500 });
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
    { status: 201 }
  );
}
