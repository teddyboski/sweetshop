// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { POST as postPaymentIntent } from "@/app/api/checkout/payment-intent/route";

// Milestone 10: this file exercises both routes many times in-process from
// the same "local-dev" IP key, which would trip the real rate limit long
// before the suite finishes. Rate limiting has its own dedicated coverage
// (tests/unit/rate-limit-check.test.ts, tests/integration/rate-limiting.test.ts)
// - mocked out here so this file stays focused on payment-intent checkout
// logic, mirroring checkout-session-route.test.ts's own setup exactly.
vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: {
    checkout: { scope: "checkout", limit: 30, windowSeconds: 60 },
    auth: { scope: "auth", limit: 60, windowSeconds: 600 },
  },
}));

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

const email = `test-payment-intent-${crypto.randomUUID()}@mailinator.com`;
const password = crypto.randomUUID();

const sampleShippingAddress = {
  name: "Ted Tester",
  line1: "123 Snack Lane",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
};

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

  await admin.from("profiles").update({ rewards_points: rewardsBalanceBeforeAll }).eq("id", userId);
});

async function seedPromotion(
  overrides: Partial<{
    discountType: "percent" | "fixed";
    value: number;
    usageLimit: number | null;
    usedCount: number;
    expiresAt: string | null;
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
    })
    .select("id, code")
    .single();
  if (error || !data) throw error;
  createdPromotionIds.push(data.id);
  return data;
}

function cartItemRequest(body: unknown, opts: { anonymousHeader?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.anonymousHeader) headers["x-anonymous-cart-id"] = opts.anonymousHeader;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/cart/items", { method: "POST", headers, body: JSON.stringify(body) });
}

function paymentIntentRequest(body: unknown, opts: { anonymousHeader?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.anonymousHeader) headers["x-anonymous-cart-id"] = opts.anonymousHeader;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost:3000/api/checkout/payment-intent", {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

async function cartIdForAuthenticatedUser(): Promise<string> {
  const { data: cart } = await admin.from("carts").select("id").eq("user_id", userId).eq("status", "active").single();
  return cart!.id;
}

describe("POST /api/checkout/payment-intent", () => {
  it("creates a Stripe PaymentIntent for a mixed cart with the correct amount, shipping, and metadata.source=mobile", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const anonymousId = boxBody.data.anonymousCartId as string;

    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { anonymousHeader: anonymousId })
    );

    const response = await postPaymentIntent(
      paymentIntentRequest(
        { guestEmail: "guest-pi@example.com", shippingAddress: sampleShippingAddress },
        { anonymousHeader: anonymousId }
      )
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.clientSecret).toMatch(/^pi_.*_secret_/);

    const paymentIntent = await stripe.paymentIntents.retrieve(body.data.paymentIntentId);
    expect(paymentIntent.amount).toBe(1500 + sellableSnackPriceCents);
    expect(paymentIntent.currency).toBe("usd");
    expect(paymentIntent.shipping?.name).toBe(sampleShippingAddress.name);
    expect(paymentIntent.shipping?.address?.line1).toBe(sampleShippingAddress.line1);
    expect(paymentIntent.metadata.cart_id).toBe(cartItem!.cart_id);
    expect(paymentIntent.metadata.guest_email).toBe("guest-pi@example.com");
    expect(paymentIntent.metadata.source).toBe("mobile");
  });

  it("sets metadata.user_id (not guest_email) for an authenticated checkout", async () => {
    const response = await postCartItem(
      cartItemRequest({ itemType: "snack", snackId: sellableSnackId, quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const piResponse = await postPaymentIntent(
      paymentIntentRequest({ shippingAddress: sampleShippingAddress }, { token: userToken })
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const paymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    expect(paymentIntent.metadata.user_id).toBe(userId);
    expect(paymentIntent.metadata.guest_email).toBeUndefined();
  });

  it("rejects a cart containing a subscription line with 400 (mobile Milestone 13 scope decision)", async () => {
    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "monthly-subscription", quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const piResponse = await postPaymentIntent(
      paymentIntentRequest({ shippingAddress: sampleShippingAddress }, { token: userToken })
    );
    expect(piResponse.status).toBe(400);
    const body = await piResponse.json();
    expect(body.error.message).toMatch(/subscribe/i);
  });

  it("rejects an empty cart with 400", async () => {
    const response = await postPaymentIntent(
      paymentIntentRequest({ guestEmail: "guest-empty@example.com", shippingAddress: sampleShippingAddress })
    );
    expect(response.status).toBe(400);
  });

  it("rejects guest checkout with no email with 400", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const anonymousId = boxBody.data.anonymousCartId as string;
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const response = await postPaymentIntent(
      paymentIntentRequest({ shippingAddress: sampleShippingAddress }, { anonymousHeader: anonymousId })
    );
    expect(response.status).toBe(400);
  });

  it("rejects a request missing shippingAddress with 400 before ever touching the cart or Stripe", async () => {
    const response = await postPaymentIntent(paymentIntentRequest({ guestEmail: "guest-noaddr@example.com" }));
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
    const anonymousId = body.data.anonymousCartId as string;
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", body.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const piResponse = await postPaymentIntent(
      paymentIntentRequest(
        { guestEmail: "guest-oos@example.com", shippingAddress: sampleShippingAddress },
        { anonymousHeader: anonymousId }
      )
    );
    expect(piResponse.status).toBe(409);

    const { data: inventoryAfter } = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("snack_id", sellableSnackId)
      .single();
    expect(inventoryAfter!.quantity_on_hand).toBe(0);
  });

  it("applies a fixed promo code discount to the PaymentIntent amount", async () => {
    const promotion = await seedPromotion({ discountType: "fixed", value: 300 });

    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const anonymousId = boxBody.data.anonymousCartId as string;
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const piResponse = await postPaymentIntent(
      paymentIntentRequest(
        { guestEmail: "guest-promo-fixed@example.com", promoCode: promotion.code, shippingAddress: sampleShippingAddress },
        { anonymousHeader: anonymousId }
      )
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const paymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    expect(paymentIntent.amount).toBe(1500 - 300);
    expect(paymentIntent.metadata.promotion_id).toBe(promotion.id);
  });

  it("rejects an expired promo code with 400", async () => {
    const promotion = await seedPromotion({ expiresAt: new Date(Date.now() - 60_000).toISOString() });

    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const anonymousId = boxBody.data.anonymousCartId as string;
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const piResponse = await postPaymentIntent(
      paymentIntentRequest(
        { guestEmail: "guest-promo-expired@example.com", promoCode: promotion.code, shippingAddress: sampleShippingAddress },
        { anonymousHeader: anonymousId }
      )
    );
    expect(piResponse.status).toBe(400);
  });

  it("rejects redeemPoints from a guest with 400", async () => {
    const boxResponse = await postCartItem(cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const boxBody = await boxResponse.json();
    const anonymousId = boxBody.data.anonymousCartId as string;
    const { data: cartItem } = await admin.from("cart_items").select("cart_id").eq("id", boxBody.data.cartItemId).single();
    createdCartIds.push(cartItem!.cart_id);

    const piResponse = await postPaymentIntent(
      paymentIntentRequest(
        { guestEmail: "guest-redeem@example.com", redeemPoints: 100, shippingAddress: sampleShippingAddress },
        { anonymousHeader: anonymousId }
      )
    );
    expect(piResponse.status).toBe(400);
  });

  it("rejects redeemPoints that exceed the authenticated user's balance with 400", async () => {
    await admin.from("profiles").update({ rewards_points: 50 }).eq("id", userId);

    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const piResponse = await postPaymentIntent(
      paymentIntentRequest({ redeemPoints: 500, shippingAddress: sampleShippingAddress }, { token: userToken })
    );
    expect(piResponse.status).toBe(400);
  });

  it("combines a valid promo code and a points redemption in the same PaymentIntent amount", async () => {
    await admin.from("profiles").update({ rewards_points: 1000 }).eq("id", userId);
    const promotion = await seedPromotion({ discountType: "fixed", value: 200 });

    const response = await postCartItem(
      cartItemRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, { token: userToken })
    );
    expect(response.status).toBe(201);
    createdCartIds.push(await cartIdForAuthenticatedUser());

    const piResponse = await postPaymentIntent(
      paymentIntentRequest(
        { promoCode: promotion.code, redeemPoints: 300, shippingAddress: sampleShippingAddress },
        { token: userToken }
      )
    );
    const piBody = await piResponse.json();
    expect(piResponse.status).toBe(201);

    const paymentIntent = await stripe.paymentIntents.retrieve(piBody.data.paymentIntentId);
    expect(paymentIntent.amount).toBe(1500 - 200 - 300); // fixed promo + 1 point = 1 cent
    expect(paymentIntent.metadata.promotion_id).toBe(promotion.id);
    expect(paymentIntent.metadata.redeemed_points).toBe("300");
  });
});
