import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveExistingCartId } from "@/lib/cart/resolve-cart";

const patchSchema = z.object({ quantity: z.number().int().min(1) });

/**
 * Both handlers re-resolve the caller's own cart (session or anonymous
 * cookie) and compare it against the cart_item's actual cart_id before
 * mutating anything. A cart_item id alone is never sufficient authorization
 * - see Milestone 5 plan, Product Decision #4. A mismatch or missing cart
 * both return 404 (never 403), so a guess doesn't confirm the id exists in
 * someone else's cart.
 */
type CartItemWithBoxType = {
  id: string;
  cart_id: string;
  item_type: string;
  boxes: { box_type: string | null } | null;
};

type OwnedCartItemResult =
  | { ok: true; item: CartItemWithBoxType }
  | { ok: false; error: string; status: number };

async function loadOwnedCartItem(
  request: NextRequest,
  admin: ReturnType<typeof createAdminSupabaseClient>,
  id: string
): Promise<OwnedCartItemResult> {
  const cartResult = await resolveExistingCartId(request, admin);
  if (cartResult.error) {
    return { ok: false, error: cartResult.error, status: cartResult.status! };
  }

  const { data: item, error: itemError } = await admin
    .from("cart_items")
    .select("id, cart_id, item_type, boxes(box_type)")
    .eq("id", id)
    .maybeSingle();

  if (itemError) {
    return { ok: false, error: itemError.message, status: 500 };
  }
  if (!item || !cartResult.cartId || item.cart_id !== cartResult.cartId) {
    return { ok: false, error: "Cart item not found", status: 404 };
  }

  return { ok: true, item };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const owned = await loadOwnedCartItem(request, admin, id);
  if (!owned.ok) {
    return NextResponse.json({ data: null, error: { message: owned.error } }, { status: owned.status });
  }

  if (owned.item.item_type === "box" && owned.item.boxes?.box_type === "build_a_box") {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Build-a-Box items can't have their quantity changed - remove and add a new one instead" },
      },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin
    .from("cart_items")
    .update({ quantity: parsed.data.quantity })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ data: null, error: { message: "Could not update quantity" } }, { status: 500 });
  }

  return NextResponse.json({ data: { id, quantity: parsed.data.quantity }, error: null }, { status: 200 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const owned = await loadOwnedCartItem(request, admin, id);
  if (!owned.ok) {
    return NextResponse.json({ data: null, error: { message: owned.error } }, { status: owned.status });
  }

  const { error: deleteError } = await admin.from("cart_items").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ data: null, error: { message: "Could not remove item" } }, { status: 500 });
  }

  return NextResponse.json({ data: { id }, error: null }, { status: 200 });
}
