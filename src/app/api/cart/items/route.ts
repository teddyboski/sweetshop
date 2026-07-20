import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { addBuildABoxToCartSchema } from "@/lib/validations/cart";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const ANONYMOUS_CART_COOKIE = "anonymous_cart_id";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = addBuildABoxToCartSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  // 1. Re-fetch the box server-side - never trust a client-supplied slot
  // count or box_type. See Milestone 4 plan, Product Decision #4.
  const { data: box, error: boxError } = await admin
    .from("boxes")
    .select("id, box_type, slot_count, status")
    .eq("slug", parsed.data.boxSlug)
    .maybeSingle();

  if (boxError) {
    return NextResponse.json({ data: null, error: { message: boxError.message } }, { status: 500 });
  }
  if (!box || box.status !== "active") {
    return NextResponse.json({ data: null, error: { message: "Box not found" } }, { status: 404 });
  }
  if (box.box_type !== "build_a_box") {
    return NextResponse.json(
      { data: null, error: { message: "This box does not accept a custom snack selection" } },
      { status: 400 }
    );
  }

  const submittedTotal = parsed.data.snacks.reduce((sum, s) => sum + s.quantity, 0);
  if (submittedTotal !== box.slot_count) {
    return NextResponse.json(
      {
        data: null,
        error: { message: `This box requires exactly ${box.slot_count} items, received ${submittedTotal}` },
      },
      { status: 400 }
    );
  }

  // 2. Every submitted snack must actually be BYO-eligible.
  const snackIds = parsed.data.snacks.map((s) => s.snackId);
  const { data: snacks, error: snacksError } = await admin
    .from("snacks")
    .select("id, is_byo_eligible")
    .in("id", snackIds);

  if (snacksError) {
    return NextResponse.json({ data: null, error: { message: snacksError.message } }, { status: 500 });
  }
  if (!snacks || snacks.length !== snackIds.length || snacks.some((s) => !s.is_byo_eligible)) {
    return NextResponse.json(
      { data: null, error: { message: "One or more snacks are not eligible for Build-a-Box" } },
      { status: 400 }
    );
  }

  // 3. Resolve the caller's cart. Auth is via an optional bearer token (per
  // the mobile-readiness constraint - matches auth/reset-password's
  // pattern), never assumed from a browser cookie session. No token means
  // guest/anonymous, resolved via a request/response-bound cookie instead
  // of next/headers' cookies() (which needs Next's request-scoped async
  // context - not available when a Route Handler is invoked directly in a
  // test, unlike NextRequest/NextResponse's own cookie jars).
  let newAnonymousCookie: string | null = null;
  const cartResult = await resolveCartId(request, admin);
  if (cartResult.error) {
    return NextResponse.json({ data: null, error: { message: cartResult.error } }, { status: cartResult.status! });
  }
  const cartId = cartResult.cartId!;
  newAnonymousCookie = cartResult.newAnonymousCookie ?? null;

  // 4. Insert the cart_items row, then the cart_item_snacks rows.
  const { data: cartItem, error: cartItemError } = await admin
    .from("cart_items")
    .insert({ cart_id: cartId, item_type: "box", box_id: box.id, quantity: 1 })
    .select("id")
    .single();

  if (cartItemError || !cartItem) {
    return NextResponse.json({ data: null, error: { message: "Could not add item to cart" } }, { status: 500 });
  }

  const { error: snackRowsError } = await admin.from("cart_item_snacks").insert(
    parsed.data.snacks.map((s) => ({
      cart_item_id: cartItem.id,
      snack_id: s.snackId,
      quantity: s.quantity,
    }))
  );

  if (snackRowsError) {
    return NextResponse.json({ data: null, error: { message: "Could not save snack selection" } }, { status: 500 });
  }

  const response = NextResponse.json({ data: { cartItemId: cartItem.id }, error: null }, { status: 201 });

  if (newAnonymousCookie) {
    response.cookies.set(ANONYMOUS_CART_COOKIE, newAnonymousCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

interface CartResolution {
  cartId?: string;
  newAnonymousCookie?: string;
  error?: string;
  status?: number;
}

async function resolveCartId(
  request: NextRequest,
  admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<CartResolution> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];

  if (token) {
    const anonClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const {
      data: { user },
    } = await anonClient.auth.getUser();

    if (!user) {
      return { error: "Invalid or expired session", status: 401 };
    }

    const { data: existingCart } = await admin
      .from("carts")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (existingCart) return { cartId: existingCart.id };

    const { data: newCart, error } = await admin.from("carts").insert({ user_id: user.id }).select("id").single();
    if (error || !newCart) return { error: "Could not create cart", status: 500 };
    return { cartId: newCart.id };
  }

  const existingAnonymousId = request.cookies.get(ANONYMOUS_CART_COOKIE)?.value;

  if (existingAnonymousId) {
    const { data: existingCart } = await admin
      .from("carts")
      .select("id")
      .eq("anonymous_id", existingAnonymousId)
      .eq("status", "active")
      .maybeSingle();
    if (existingCart) return { cartId: existingCart.id };
  }

  const newAnonymousId = crypto.randomUUID();
  const { data: newCart, error } = await admin
    .from("carts")
    .insert({ anonymous_id: newAnonymousId })
    .select("id")
    .single();
  if (error || !newCart) return { error: "Could not create cart", status: 500 };

  return { cartId: newCart.id, newAnonymousCookie: newAnonymousId };
}
