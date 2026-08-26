// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { GET as getCart } from "@/app/api/cart/route";

// Milestone 10: this file exercises these routes many times in-process from
// the same "local-dev" IP key, which would trip the real rate limit long
// before the suite finishes - mocked out the same way every other cart test
// file does.
vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: {
    checkout: { scope: "checkout", limit: 30, windowSeconds: 60 },
    catalog: { scope: "catalog", limit: 300, windowSeconds: 60 },
  },
}));

/**
 * Covers mergeAnonymousCartIntoUserCart (src/lib/cart/resolve-cart.ts), the
 * fix for a gap discovered while auditing Milestone 13 against its own
 * roadmap promise ("anonymous ID... synced to user_id post-auth"): a
 * guest's cart was previously orphaned on login, since cart resolution only
 * ever looked a cart up by user_id, never by the anonymous id the caller
 * might still be carrying. Merge policy (Ted, 2026-08-09): combine, never
 * discard - see that function's own header comment for the reparent-not-sum
 * reasoning.
 */

const admin = createAdminSupabaseClient();

let sellableSnackId: string;
let secondSellableSnackId: string;
const createdCartIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  const { data: snacks } = await admin
    .from("snacks")
    .select("id")
    .eq("is_sellable_individually", true)
    .limit(2);
  sellableSnackId = snacks![0]!.id;
  secondSellableSnackId = snacks![1]?.id ?? snacks![0]!.id;
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

afterEach(async () => {
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;
});

async function createSignedInUser(prefix: string) {
  const userEmail = `test-${prefix}-${crypto.randomUUID()}@mailinator.com`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email: userEmail, password, email_confirm: true });
  if (error || !data.user) throw error;
  createdUserIds.push(data.user.id);

  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data: session, error: signInError } = await anonAuthClient.auth.signInWithPassword({
    email: userEmail,
    password,
  });
  if (signInError || !session.session) throw signInError;

  return { id: data.user.id, token: session.session.access_token };
}

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

describe("Anonymous cart -> account cart merge on the first authenticated request after login", () => {
  it("promotes the anonymous cart in place when the account has no existing active cart yet", async () => {
    const guestResponse = await postCartItem(cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 2 }));
    const guestBody = await guestResponse.json();
    const anonymousId = guestBody.data.anonymousCartId as string;
    const anonymousCartId: string = (
      await admin.from("cart_items").select("cart_id").eq("id", guestBody.data.cartItemId).single()
    ).data!.cart_id;

    const user = await createSignedInUser("merge-promote");

    const response = await getCart(cartGetRequest({ token: user.token, anonymousHeader: anonymousId }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.cartId).toBe(anonymousCartId); // promoted in place, same row
    expect(body.data.lines).toHaveLength(1);
    createdCartIds.push(anonymousCartId);

    const { data: cartRow } = await admin.from("carts").select("user_id, anonymous_id, status").eq("id", anonymousCartId).single();
    expect(cartRow!.user_id).toBe(user.id);
    expect(cartRow!.anonymous_id).toBeNull();
    expect(cartRow!.status).toBe("active");
  });

  it("combines an anonymous cart into an already-existing account cart, keeping both sides' items", async () => {
    const user = await createSignedInUser("merge-combine");

    const accountItemResponse = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: user.token })
    );
    expect(accountItemResponse.status).toBe(201);
    const { data: accountCart } = await admin
      .from("carts")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    createdCartIds.push(accountCart!.id);

    const guestResponse = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: secondSellableSnackId, quantity: 3 })
    );
    const guestBody = await guestResponse.json();
    const anonymousId = guestBody.data.anonymousCartId as string;
    const { data: anonymousCartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", guestBody.data.cartItemId)
      .single();
    const anonymousCartId = anonymousCartItem!.cart_id;

    const response = await getCart(cartGetRequest({ token: user.token, anonymousHeader: anonymousId }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.cartId).toBe(accountCart!.id); // account cart wins the id, anonymous cart's rows move onto it
    expect(body.data.lines).toHaveLength(2);

    const { data: anonymousCartAfter } = await admin.from("carts").select("status").eq("id", anonymousCartId).single();
    expect(anonymousCartAfter!.status).toBe("abandoned");

    const { data: remainingAnonymousItems } = await admin.from("cart_items").select("id").eq("cart_id", anonymousCartId);
    expect(remainingAnonymousItems).toHaveLength(0); // reparented onto the account cart, not left behind or duplicated
  });

  it("does nothing when the caller sends no anonymous id (normal authenticated flow, unaffected)", async () => {
    const user = await createSignedInUser("merge-noop");

    const response = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: user.token })
    );
    expect(response.status).toBe(201);
    const { data: cart } = await admin.from("carts").select("id").eq("user_id", user.id).eq("status", "active").single();
    createdCartIds.push(cart!.id);

    const getResponse = await getCart(cartGetRequest({ token: user.token }));
    const body = await getResponse.json();
    expect(body.data.cartId).toBe(cart!.id);
    expect(body.data.lines).toHaveLength(1);
  });

  it("is a no-op for an anonymous id that doesn't match any active cart (already merged, converted, or never existed)", async () => {
    const user = await createSignedInUser("merge-stale-id");

    const response = await getCart(cartGetRequest({ token: user.token, anonymousHeader: crypto.randomUUID() }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.cartId).toBeNull(); // no account cart existed, and there was nothing valid to merge/promote
  });
});
