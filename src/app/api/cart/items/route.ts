import { NextRequest, NextResponse } from "next/server";
import { addToCartSchema } from "@/lib/validations/cart";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCartId, ANONYMOUS_CART_COOKIE } from "@/lib/cart/resolve-cart";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.checkout);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = addToCartSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  const itemResult =
    parsed.data.itemType === "build_a_box"
      ? await prepareBuildABoxItem(admin, parsed.data)
      : parsed.data.itemType === "box"
        ? await prepareBoxItem(admin, parsed.data)
        : parsed.data.itemType === "snack"
          ? await prepareSnackItem(admin, parsed.data)
          : await prepareMerchItem(admin, parsed.data);

  if (itemResult.error) {
    return NextResponse.json({ data: null, error: { message: itemResult.error } }, { status: itemResult.status! });
  }

  const cartResult = await resolveCartId(request, admin);
  if (cartResult.error) {
    return NextResponse.json({ data: null, error: { message: cartResult.error } }, { status: cartResult.status! });
  }
  const cartId = cartResult.cartId!;

  // Derived from which id PreparedItem actually populated, not re-read
  // from the request body - merch is checked first since a merch line
  // carries both merchItemId and merchVariantId, snack next, box last.
  const itemType = itemResult.merchVariantId ? "merch" : itemResult.snackId ? "snack" : "box";

  const { data: cartItem, error: cartItemError } = await admin
    .from("cart_items")
    .insert({
      cart_id: cartId,
      item_type: itemType,
      box_id: itemResult.boxId ?? null,
      snack_id: itemResult.snackId ?? null,
      merch_item_id: itemResult.merchItemId ?? null,
      merch_variant_id: itemResult.merchVariantId ?? null,
      quantity: itemResult.quantity!,
    })
    .select("id")
    .single();

  if (cartItemError || !cartItem) {
    return NextResponse.json({ data: null, error: { message: "Could not add item to cart" } }, { status: 500 });
  }

  if (itemResult.snackSelections) {
    const { error: snackRowsError } = await admin.from("cart_item_snacks").insert(
      itemResult.snackSelections.map((s) => ({
        cart_item_id: cartItem.id,
        snack_id: s.snackId,
        quantity: s.quantity,
      }))
    );

    if (snackRowsError) {
      return NextResponse.json({ data: null, error: { message: "Could not save snack selection" } }, { status: 500 });
    }
  }

  // anonymousCartId is echoed in the body (not just the Set-Cookie below)
  // so a mobile client - which can't rely on cookie-jar persistence the
  // way a browser can - has an explicit value to save in SecureStore and
  // replay via the X-Anonymous-Cart-Id header on every later cart call.
  const response = NextResponse.json(
    { data: { cartItemId: cartItem.id, anonymousCartId: cartResult.anonymousCartId ?? null }, error: null },
    { status: 201 }
  );

  if (cartResult.newAnonymousCookie) {
    response.cookies.set(ANONYMOUS_CART_COOKIE, cartResult.newAnonymousCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

interface PreparedItem {
  boxId?: string;
  snackId?: string;
  merchItemId?: string;
  merchVariantId?: string;
  quantity?: number;
  snackSelections?: Array<{ snackId: string; quantity: number }>;
  error?: string;
  status?: number;
}

async function prepareBuildABoxItem(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  data: Extract<import("@/lib/validations/cart").AddToCartInput, { itemType: "build_a_box" }>
): Promise<PreparedItem> {
  // Never trust a client-supplied slot count or box_type. See Milestone 4
  // plan, Product Decision #4.
  const { data: box, error: boxError } = await admin
    .from("boxes")
    .select("id, box_type, slot_count, status")
    .eq("slug", data.boxSlug)
    .maybeSingle();

  if (boxError) return { error: boxError.message, status: 500 };
  if (!box || box.status !== "active") return { error: "Box not found", status: 404 };
  if (box.box_type !== "build_a_box") {
    return { error: "This box does not accept a custom snack selection", status: 400 };
  }

  const submittedTotal = data.snacks.reduce((sum, s) => sum + s.quantity, 0);
  if (submittedTotal !== box.slot_count) {
    return {
      error: `This box requires exactly ${box.slot_count} items, received ${submittedTotal}`,
      status: 400,
    };
  }

  const snackIds = data.snacks.map((s) => s.snackId);
  const { data: snacks, error: snacksError } = await admin
    .from("snacks")
    .select("id, is_byo_eligible, status")
    .in("id", snackIds);

  if (snacksError) return { error: snacksError.message, status: 500 };
  if (
    !snacks ||
    snacks.length !== snackIds.length ||
    snacks.some((s) => !s.is_byo_eligible || s.status !== "active")
  ) {
    return { error: "One or more snacks are not eligible for Build-a-Box", status: 400 };
  }

  return { boxId: box.id, quantity: 1, snackSelections: data.snacks };
}

async function prepareBoxItem(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  data: Extract<import("@/lib/validations/cart").AddToCartInput, { itemType: "box" }>
): Promise<PreparedItem> {
  const { data: box, error } = await admin
    .from("boxes")
    .select("id, status")
    .eq("slug", data.boxSlug)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!box || box.status !== "active") return { error: "Box not found", status: 404 };

  return { boxId: box.id, quantity: data.quantity };
}

async function prepareSnackItem(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  data: Extract<import("@/lib/validations/cart").AddToCartInput, { itemType: "snack" }>
): Promise<PreparedItem> {
  const { data: snack, error } = await admin
    .from("snacks")
    .select("id, is_sellable_individually, status")
    .eq("id", data.snackId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!snack || !snack.is_sellable_individually || snack.status !== "active") {
    return { error: "Snack not found", status: 404 };
  }

  return { snackId: snack.id, quantity: data.quantity };
}

async function prepareMerchItem(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  data: Extract<import("@/lib/validations/cart").AddToCartInput, { itemType: "merch" }>
): Promise<PreparedItem> {
  const { data: variant, error } = await admin
    .from("merch_variants")
    .select("id, merch_item_id, merch_items(status)")
    .eq("id", data.merchVariantId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!variant || variant.merch_items?.status !== "active") {
    return { error: "Item not found", status: 404 };
  }

  return { merchItemId: variant.merch_item_id, merchVariantId: variant.id, quantity: data.quantity };
}
