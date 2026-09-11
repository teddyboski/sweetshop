import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { z } from "zod";

const createSnackVariantSchema = z.object({
  size: z.enum(["Small", "Medium", "Large"]),
  priceCents: z.number().int().positive(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: snackId } = await params;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("snack_variants")
    .select("id, size, price_cents, status")
    .eq("snack_id", snackId)
    .order("price_cents");
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { id: snackId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createSnackVariantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("snack_variants")
    .insert({ snack_id: snackId, size: parsed.data.size, price_cents: parsed.data.priceCents })
    .select("id, size, price_cents, status")
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null }, { status: 201 });
}