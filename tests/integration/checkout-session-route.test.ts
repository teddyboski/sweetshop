// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { POST as postCheckoutSession } from "@/app/api/checkout/session/route";

// Milestone 10: this file exercises both routes many times in-process from
// the same "local-dev" IP key, which would trip the real rate limit long
// before the suite finishes. Rate limiting has its own dedicated coverage
// (tests/unit/rate-limit-check.test.ts, tests/integration/rate-limiting.test.ts)
// - mocked out here so this file stays focused on checkout logic.
vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: {
    checkout: { scope: "checkout", limit: 30, windowSeconds: 60 },
    auth: { scope: "auth", limit: 60, windowSeconds: 600 },
  },
}));

// See rls-cross-user.test.ts's header comment: never call a session-mutating
// auth method on the admin client itself - use a separate plain client to
// sign in and obtain a bearer token instead.
const admin = createAdminSupabaseClient();
const stripe = createStripeClient();

let sellableSnackId: string;
let sellableSnackPriceCents: number;
let userId: string;
let userToken: string;
const createdCartIds: string[] = [];
const inventoryRestores: Array<{ snackId: string; quantity: number }> = [];
const createdPromotionIds: string[] = [];
let rewardsBalanceBeforeAll: number;

const email = `test-checkout-${crypto.randomUUID()}@mailinator.com`;
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

  const { data: profile } = await admin.from("profiles").select("rewards_points").eq("id", userId).single();
  rewardsBalanceBeforeAll = profile?.rewards_points ?? 0;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

afterEach(async () => {
  for (const cartId of createdCartIds) {
    await admin.rpc("release_inventory_for_cart", { p_cart_id: cartId });
  }
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;

  for (const { snackId, quantity } of inventoryRestores) {
    await admin.from("inventory").update({ quantity_on_hand: quantity }).eq("snack_id", snackId);
  }
  inventoryRestores.length = 0;

  for (const id of createdPromotionIds) {
    await admin.from("promotions").delete().eq("id", id);
  }
  createdPromotionIds.length = 0;

  await admin.from("promotion_redemptions").delete().eq("user_id", userId);
  await admin.from("orders").delete().eq("user_id", userId).eq("total_amount_cents", 777);
  await admin.from("profiles").update({ signup_offer_code: null }).eq("id", userId);
  await admin.from("profiles").update({ rewards_points: rewardsBalanceBeforeAll }).eq("id", userId);
});

// Milestone 9: mirrors rewards-referrals-foundations.test.ts's seedPromotion
// helper - a fresh, uniquely-coded row per test so tests never collide.
async function seedPromotion(
  overrides: Partial<{
    discountType: "percent" | "fixed";
    value: number;
    usageLimit: number | null;
    usedCount: number;
    expiresAt: string | null;
    firstOrderOnly: boolean;
  }> = {}
) {
  const { data, error } = await admin
    .from("promotions")
    .insert({
      code: `TEST${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      discount_type: overrides.discountType ?? "fixed",
      value: overrides.value ?? 300,
      usage_limit: overrides.usageLimit ?? null,
      used_count: overrides.usedCount ?? 0,
      expires_at: overrides.expiresAt ?? null,
      first_order_only: overrides.firstOrderOnly ?? false,
    })
    .select("id, code")
    .single();
  if (error || !data) throw error;
  createdPromotionIds.push(data.id);
  return data;
}

function cartItemRequest(body: unknown, opts: { cookie?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = `anonymous_cart_id=${opts.cookie}`;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/cart/items", { method: "POST", headers, body: JSON.stringify(body) });
}

function checkoutSessionRequest(body: unknown, opts: { cookie?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = `anonymous_cart_id=${opts.cookie}`;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/checkout/session", {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

async function cartIdForAuthenticatedUser(): Promise<string> {
  const { data: cart } = await admin.from("carts").select("id").eq("user_id", userId).eq("status", "active").single();
  return cart!.id;
}

describe("POST /api/checkout/session", () => {
  it("creates a Stripe Checkout Session for a mixed cart with the correct line items", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];

    const { data: cartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", boxBody.data.cartItemId)
      .single();
    createdCartIds.push(cartItem!.cart_id);

    await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { cookie: cookieValue })
    );

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest@example.com" }, { cookie: cookieValue })
    );
    const checkoutBody = await checkoutResponse.json();

    expect(checkoutResponse.status).toBe(201);
    expect(checkoutBody.data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const session = await stripe.checkout.sessions.retrieve(checkoutBody.data.id, { expand: ["line_items"] });
    expect(session.mode).toBe("payment");
    expect(session.metadata?.cart_id).toBe(cartItem!.cart_id);
    expect(session.metadata?.guest_email).toBe("guest@example.com");
    expect(session.line_items?.data).toHaveLength(2);

    const subtotalCents = session.line_items!.data.reduce((sum, item) => sum + (item.amount_total ?? 0), 0);
    expect(subtotalCents).toBe(1500 + sellableSnackPriceCents); // munchie-box + the chosen sellable snack
  });

  it("creates a subscription-mode session for an authenticated user with the subscription box", async () => {
    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "monthly-subscription", quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({}, { token: userToken }));
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    expect(session.mode).toBe("subscription");
    expect(session.metadata?.user_id).toBe(userId);
  });

  it("rejects guest checkout with a subscription line with 400 (Milestone 6 plan, Product Decision #8)", async () => {
    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "monthly-subscription", quantity: 1 })
    );
    const body = await response.json();
    const cookieValue = response.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", body.data.cartItemId)
      .single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest@example.com" }, { cookie: cookieValue })
    );
    expect(checkoutResponse.status).toBe(400);
  });

  it("rejects an empty cart with 400", async () => {
    const response = await postCheckoutSession(checkoutSessionRequest({ guestEmail: "guest@example.com" }));
    expect(response.status).toBe(400);
  });

  it("rejects guest checkout with no email with 400", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", boxBody.data.cartItemId)
      .single();
    createdCartIds.push(cartItem!.cart_id);

    const response = await postCheckoutSession(checkoutSessionRequest({}, { cookie: cookieValue }));
    expect(response.status).toBe(400);
  });

  it("rejects with 409 and leaves inventory untouched when a cart item is out of stock", async () => {
    const { data: originalInventory } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", sellableSnackId)
      .single();
    inventoryRestores.push({ snackId: sellableSnackId, quantity: originalInventory!.quantity_on_hand });
    await admin.from("inventory").update({ quantity_on_hand: 0 }).eq("snack_id", sellableSnackId);

    const response = await postCartItem(cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }));
    const body = await response.json();
    const cookieValue = response.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", body.data.cartItemId)
      .single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest@example.com" }, { cookie: cookieValue })
    );
    expect(checkoutResponse.status).toBe(409);

    const { data: inventoryAfter } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", sellableSnackId)
      .single();
    expect(inventoryAfter!.quantity_on_hand).toBe(0);
  });

  // Milestone 9, Task 3. munchie-box (1500 cents) is used throughout below
  // because a box line makes hasBox true, which zeroes shipping (see
  // calculate-total.ts) - so subtotalCents === totalCents === 1500 exactly,
  // making the expected post-discount amount_total simple arithmetic.
  it("applies a fixed promo code discount to the session total", async () => {
    const promotion = await seedPromotion({ discountType: "fixed", value: 300 });

    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-promo-fixed@example.com", promoCode: promotion.code }, { cookie: cookieValue })
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    expect(session.amount_total).toBe(1500 - 300);
    expect(session.metadata?.promotion_id).toBe(promotion.id);
  });

  it("applies a percent promo code discount to the session total", async () => {
    const promotion = await seedPromotion({ discountType: "percent", value: 10 });

    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-promo-percent@example.com", promoCode: promotion.code }, { cookie: cookieValue })
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    expect(session.amount_total).toBe(1500 - 150); // round(1500 * 10 / 100)
  });

  it("rejects an expired promo code with 400", async () => {
    const promotion = await seedPromotion({ expiresAt: new Date(Date.now() - 60_000).toISOString() });

    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-promo-expired@example.com", promoCode: promotion.code }, { cookie: cookieValue })
    );
    expect(checkoutResponse.status).toBe(400);
  });

  it("rejects a promo code that has already hit its usage limit with 400", async () => {
    const promotion = await seedPromotion({ usageLimit: 1, usedCount: 1 });

    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-promo-limit@example.com", promoCode: promotion.code }, { cookie: cookieValue })
    );
    expect(checkoutResponse.status).toBe(400);
  });

  it("rejects an unknown promo code with 400", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-promo-unknown@example.com", promoCode: "NOT-A-REAL-CODE" }, { cookie: cookieValue })
    );
    expect(checkoutResponse.status).toBe(400);
  });

  it("rejects redeemPoints from a guest with 400", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const cookieValue = boxResponse.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ guestEmail: "guest-redeem@example.com", redeemPoints: 100 }, { cookie: cookieValue })
    );
    expect(checkoutResponse.status).toBe(400);
  });

  it("rejects redeemPoints that exceed the authenticated user's balance with 400", async () => {
    await admin.from("profiles").update({ rewards_points: 50 }).eq("id", userId);

    const boxResponse = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(boxResponse.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const checkoutResponse = await postCheckoutSession(checkoutSessionRequest({ redeemPoints: 500 }, { token: userToken }));
    expect(checkoutResponse.status).toBe(400);
  });

  it("combines a valid promo code and a points redemption in the same checkout session", async () => {
    await admin.from("profiles").update({ rewards_points: 1000 }).eq("id", userId);
    const promotion = await seedPromotion({ discountType: "fixed", value: 200 });

    const boxResponse = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(boxResponse.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const checkoutResponse = await postCheckoutSession(
      checkoutSessionRequest({ promoCode: promotion.code, redeemPoints: 300 }, { token: userToken })
    );
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutResponse.status).toBe(201);

    const session = await stripe.checkout.sessions.retrieve(checkoutBody.data.id);
    expect(session.amount_total).toBe(1500 - 200 - 300); // fixed promo + 1 point = 1 cent
    expect(session.metadata?.promotion_id).toBe(promotion.id);
    expect(session.metadata?.redeemed_points).toBe("300");
  });
});

describe("POST /api/checkout/session: promotions on an active snack cart", { timeout: 30_000 }, () => {
  let snack = { id: "", priceCents: 0 };

  beforeAll(async () => {
    const { data: candidates } = await admin
      .from("snacks")
      .select("id, price_cents")
      .eq("is_sellable_individually", true)
      .eq("status", "active")
      .gte("price_cents", 299)
      .limit(25);

    for (const candidate of candidates ?? []) {
      const { data: stock } = await admin
        .from("inventory")
        .select("quantity_on_hand")
        .eq("snack_id", candidate.id)
        .maybeSingle();
      if ((stock?.quantity_on_hand ?? 0) >= 5) {
        snack = { id: candidate.id, priceCents: candidate.price_cents! };
        return;
      }
    }
    throw new Error("No active, in-stock, individually sellable snack found for the promotion tests");
  });

  const percentOf = (cents: number, percent: number) => Math.round((cents * percent) / 100);

  async function addSnackForUser() {
    const response = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: snack.id, quantity: 1 }, { token: userToken })
    );
    expect(response.ok).toBe(true);
    createdCartIds.push(await cartIdForAuthenticatedUser());
  }

  async function addSnackForGuest() {
    const response = await postCartItem(cartItemRequest({ itemType: "snack", snackId: snack.id, quantity: 1 }));
    expect(response.ok).toBe(true);
    const body = await response.json();
    const cookie = response.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];
    const { data: item } = await admin.from("cart_items").select("cart_id").eq("id", body.data.cartItemId).single();
    createdCartIds.push(item!.cart_id);
    return cookie;
  }

  async function seedPaidOrderForUser() {
    const { error } = await admin
      .from("orders")
      .insert({ user_id: userId, status: "paid", total_amount_cents: 777 });
    if (error) throw error;
  }

  async function startSession(body: Record<string, unknown>, opts: { token?: string; cookie?: string } = {}) {
    const response = await postCheckoutSession(checkoutSessionRequest(body, opts));
    const json = await response.json();
    return { response, json };
  }

  async function appliedDiscount(sessionId: string) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return { cents: session.total_details?.amount_discount ?? 0, promotionId: session.metadata?.promotion_id };
  }

  describe("ordinary typed codes (behaviour that must not change)", () => {
    it("applies a fixed promo code", async () => {
      const promotion = await seedPromotion({ discountType: "fixed", value: 300 });
      const cookie = await addSnackForGuest();

      const { response, json } = await startSession(
        { guestEmail: "guest-fixed@example.com", promoCode: promotion.code },
        { cookie }
      );
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({ cents: 300, promotionId: promotion.id });
    });

    it("applies a percent promo code to the subtotal", async () => {
      const promotion = await seedPromotion({ discountType: "percent", value: 10 });
      const cookie = await addSnackForGuest();

      const { response, json } = await startSession(
        { guestEmail: "guest-percent@example.com", promoCode: promotion.code },
        { cookie }
      );
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({
        cents: percentOf(snack.priceCents, 10),
        promotionId: promotion.id,
      });
    });

    it("rejects an expired promo code with the existing message", async () => {
      const promotion = await seedPromotion({ expiresAt: new Date(Date.now() - 60_000).toISOString() });
      const cookie = await addSnackForGuest();

      const { response, json } = await startSession(
        { guestEmail: "guest-expired@example.com", promoCode: promotion.code },
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(json.error.message).toBe("That promo code isn't valid");
    });

    it("rejects a promo code that reached its usage limit with the existing message", async () => {
      const promotion = await seedPromotion({ usageLimit: 1, usedCount: 1 });
      const cookie = await addSnackForGuest();

      const { response, json } = await startSession(
        { guestEmail: "guest-limit@example.com", promoCode: promotion.code },
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(json.error.message).toBe("That promo code isn't valid");
    });

    it("rejects an unknown promo code with the existing message", async () => {
      const cookie = await addSnackForGuest();

      const { response, json } = await startSession(
        { guestEmail: "guest-unknown@example.com", promoCode: "NOT-A-REAL-CODE" },
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(json.error.message).toBe("That promo code isn't valid");
    });
  });

  describe("first-order welcome offer", () => {
    it("auto-applies the offer for a customer who signed up through the scan and has no paid order", async () => {
      const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      await admin.from("profiles").update({ signup_offer_code: promotion.code }).eq("id", userId);
      await addSnackForUser();

      const { response, json } = await startSession({}, { token: userToken });
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({
        cents: percentOf(snack.priceCents, 15),
        promotionId: promotion.id,
      });
    });

    it("charges full price, without an error, when the customer has no signup offer", async () => {
      await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      await addSnackForUser();

      const { response, json } = await startSession({}, { token: userToken });
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({ cents: 0, promotionId: undefined });
    });

    it("does not auto-apply once the customer has a paid order", async () => {
      const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      await admin.from("profiles").update({ signup_offer_code: promotion.code }).eq("id", userId);
      await seedPaidOrderForUser();
      await addSnackForUser();

      const { response, json } = await startSession({}, { token: userToken });
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({ cents: 0, promotionId: undefined });
    });

    it("does not auto-apply once the customer has already redeemed it", async () => {
      const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      await admin.from("profiles").update({ signup_offer_code: promotion.code }).eq("id", userId);
      await admin.from("promotion_redemptions").insert({ promotion_id: promotion.id, user_id: userId });
      await addSnackForUser();

      const { response, json } = await startSession({}, { token: userToken });
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({ cents: 0, promotionId: undefined });
    });

    it("applies a typed first-order-only code for an eligible customer", async () => {
      const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      await addSnackForUser();

      const { response, json } = await startSession({ promoCode: promotion.code }, { token: userToken });
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({
        cents: percentOf(snack.priceCents, 15),
        promotionId: promotion.id,
      });
    });

    it("refuses a typed first-order-only code after a paid order, with a specific message", async () => {
      const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      await seedPaidOrderForUser();
      await addSnackForUser();

      const { response, json } = await startSession({ promoCode: promotion.code }, { token: userToken });
      expect(response.status).toBe(400);
      expect(json.error.message).toBe("That offer is for your first order only");
    });

    it("refuses a typed first-order-only code from a guest", async () => {
      const promotion = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      const cookie = await addSnackForGuest();

      const { response, json } = await startSession(
        { guestEmail: "guest-offer@example.com", promoCode: promotion.code },
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(json.error.message).toBe("Log in or sign up to use this offer");
    });

    it("lets a typed ordinary code win over the auto-applied welcome offer", async () => {
      const offer = await seedPromotion({ discountType: "percent", value: 15, firstOrderOnly: true });
      const fixed = await seedPromotion({ discountType: "fixed", value: 300 });
      await admin.from("profiles").update({ signup_offer_code: offer.code }).eq("id", userId);
      await addSnackForUser();

      const { response, json } = await startSession({ promoCode: fixed.code }, { token: userToken });
      expect(response.status).toBe(201);
      expect(await appliedDiscount(json.data.id)).toEqual({ cents: 300, promotionId: fixed.id });
    });
  });
});
