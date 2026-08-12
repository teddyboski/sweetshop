// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { GET as getCart } from "@/app/api/cart/route";

// Milestone 10: this file exercises these routes many times in-process from
// the same "local-dev" IP key, which would trip the real rate limit long
// before the suite finishes. Rate limiting has its own dedicated coverage
// (tests/unit/rate-limit-check.test.ts, tests/integration/rate-limiting.test.ts)
// - mocked out here so this file stays focused on cart-read logic.
vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: {
    checkout: { scope: "checkout", limit: 30, windowSeconds: 60 },
    catalog: { scope: "catalog", limit: 300, windowSeconds: 60 },
  },
}));

const admin = createAdminSupabaseClient();

let sellableSnackId: string;
let sellableSnackPriceCents: number;
let userId: string;
let userToken: string;
const createdCartIds: string[] = [];

const email = `test-mobile-cart-${crypto.randomUUID()}@mailinator.com`;
const password = crypto.randomUUID();

beforeAll(async () => {
  const { data: snack } = await admin
    .from("snacks")
    .select("id, price_cents")
    .eq("is_sellable_individually", true)
    .limit(1)
    .single();
  sellableSnackId = snack!.id;
  sellableSnackPriceCents = snack!.price_cents!;

  const { data: user, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !user.user) throw createError;
  userId = user.user.id;

  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data: session, error: signInError } = await anonAuthClient.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError;
  userToken = session.session.access_token;
});

afterEach(async () => {
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;
});

function cartItemRequest(body: unknown, opts: { anonymousHeader?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.anonymousHeader) headers["x-anonymous-cart-id"] = opts.anonymousHeader;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/cart/items", { method: "POST", headers, body: JSON.stringify(body) });
}

function cartGetRequest(opts: { anonymousHeader?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.anonymousHeader) headers["x-anonymous-cart-id"] = opts.anonymousHeader;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/cart", { method: "GET", headers });
}

describe("GET /api/cart", () => {
  it("returns an empty cart with zero totals when the caller has no anonymous id and no session", async () => {
    const response = await getCart(cartGetRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.cartId).toBeNull();
    expect(body.data.lines).toEqual([]);
    expect(body.data.total).toEqual({ subtotalCents: 0, shippingCents: 0, totalCents: 0, hasBox: false });
  });

  it("does not create a cart as a side effect of reading one that doesn't exist yet (resolveExistingCartId, not resolveCartId)", async () => {
    const anonymousId = crypto.randomUUID();
    const response = await getCart(cartGetRequest({ anonymousHeader: anonymousId }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.cartId).toBeNull();

    const { data: cart } = await admin.from("carts").select("id").eq("anonymous_id", anonymousId).maybeSingle();
    expect(cart).toBeNull();
  });

  it("returns a mixed cart's lines and total via the X-Anonymous-Cart-Id header, matching what /api/cart/items already echoed back", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const anonymousId = boxBody.data.anonymousCartId as string;
    expect(anonymousId).toBeTruthy();

    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 2 }, { anonymousHeader: anonymousId })
    );

    const response = await getCart(cartGetRequest({ anonymousHeader: anonymousId }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.cartId).toBe(cartItem!.cart_id);
    expect(body.data.lines).toHaveLength(2);
    expect(body.data.total.subtotalCents).toBe(1500 + sellableSnackPriceCents * 2);
    expect(body.data.total.hasBox).toBe(true);
    expect(body.data.total.shippingCents).toBe(0); // a box line always ships free
    expect(body.data.anonymousCartId).toBe(anonymousId);
  });

  it("resolves an authenticated user's cart by bearer token, ignoring any anonymous header sent alongside it", async () => {
    const addResponse = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: userToken })
    );
    expect(addResponse.status).toBe(201);

    const { data: cart } = await admin.from("carts").select("id").eq("user_id", userId).eq("status", "active").single();
    createdCartIds.push(cart!.id);

    const response = await getCart(cartGetRequest({ token: userToken, anonymousHeader: crypto.randomUUID() }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.cartId).toBe(cart!.id);
    expect(body.data.lines).toHaveLength(1);
  });

  it("rejects an expired or invalid bearer token with 401", async () => {
    const response = await getCart(cartGetRequest({ token: "not-a-real-token" }));
    expect(response.status).toBe(401);
  });
});
