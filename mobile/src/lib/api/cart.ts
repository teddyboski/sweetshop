import * as SecureStore from "expo-secure-store";
import { authenticatedFetch } from "./authenticated-fetch";

/**
 * Milestone 13: mobile-side half of the anonymous-cart contract the
 * backend's resolve-cart.ts now supports (see its ANONYMOUS_CART_HEADER
 * comment) - the X-Anonymous-Cart-Id header is this client's equivalent of
 * the web app's httpOnly cookie, persisted in SecureStore since there's no
 * browser cookie jar here. Same signed-in-vs-guest split as
 * authenticated-fetch.ts: when signed in, the bearer token alone resolves
 * the cart server-side and this header is simply unused.
 */
const ANONYMOUS_CART_KEY = "sweetshop_anonymous_cart_id";

async function getStoredAnonymousCartId(): Promise<string | null> {
  return SecureStore.getItemAsync(ANONYMOUS_CART_KEY);
}

async function storeAnonymousCartId(id: string): Promise<void> {
  await SecureStore.setItemAsync(ANONYMOUS_CART_KEY, id);
}

// Exported (Milestone 13) so the checkout API client can resolve the exact
// same cart - both /api/checkout/payment-intent and /api/checkout/session
// go through resolveExistingCartId server-side, same as GET /api/cart, so
// requests need the same anonymous-cart header attached here.
export async function cartFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const anonymousId = await getStoredAnonymousCartId();
  const headers = new Headers(init.headers);
  if (anonymousId) headers.set("X-Anonymous-Cart-Id", anonymousId);
  return authenticatedFetch(path, { ...init, headers });
}

export interface CartLine {
  id: string;
  itemType: "box" | "snack" | "merch";
  quantity: number;
  unitPriceCents: number;
  name: string;
  slug: string | null;
  isBuildABox: boolean;
  slotCount: number | null;
  isSubscription: boolean;
  cadence: string | null;
  snackSelections?: Array<{ snackId: string; name: string; quantity: number }>;
  /** Set only on merch lines, e.g. "Medium / Navy". */
  variantLabel?: string | null;
}

export interface CartTotal {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  hasBox: boolean;
}

export interface CartContents {
  cartId: string | null;
  lines: CartLine[];
  total: CartTotal;
  anonymousCartId: string | null;
}

interface Envelope<T> {
  data: T | null;
  error: { message: string } | null;
}

async function unwrapEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `Request failed with status ${response.status}`);
  }
  return body.data as T;
}

/** Persists anonymousCartId from any cart response that carries one - every mutating call gets this for free by routing through here. */
async function persistAnonymousId(data: { anonymousCartId?: string | null } | null) {
  if (data?.anonymousCartId) {
    await storeAnonymousCartId(data.anonymousCartId);
  }
}

export async function fetchCart(): Promise<CartContents> {
  const response = await cartFetch("/api/cart");
  const data = await unwrapEnvelope<CartContents>(response);
  await persistAnonymousId(data);
  return data;
}

interface AddItemResult {
  cartItemId: string;
  anonymousCartId: string | null;
}

export async function addBoxToCart(boxSlug: string, quantity = 1): Promise<AddItemResult> {
  const response = await cartFetch("/api/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemType: "box", boxSlug, quantity }),
  });
  const data = await unwrapEnvelope<AddItemResult>(response);
  await persistAnonymousId(data);
  return data;
}

export async function addSnackToCart(snackId: string, quantity = 1): Promise<AddItemResult> {
  const response = await cartFetch("/api/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemType: "snack", snackId, quantity }),
  });
  const data = await unwrapEnvelope<AddItemResult>(response);
  await persistAnonymousId(data);
  return data;
}

export async function addMerchToCart(merchVariantId: string, quantity = 1): Promise<AddItemResult> {
  const response = await cartFetch("/api/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemType: "merch", merchVariantId, quantity }),
  });
  const data = await unwrapEnvelope<AddItemResult>(response);
  await persistAnonymousId(data);
  return data;
}

export async function addBuildABoxToCart(
  boxSlug: string,
  snacks: Array<{ snackId: string; quantity: number }>
): Promise<AddItemResult> {
  const response = await cartFetch("/api/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemType: "build_a_box", boxSlug, snacks }),
  });
  const data = await unwrapEnvelope<AddItemResult>(response);
  await persistAnonymousId(data);
  return data;
}

export async function updateCartItemQuantity(id: string, quantity: number): Promise<void> {
  const response = await cartFetch(`/api/cart/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity }),
  });
  await unwrapEnvelope(response);
}

export async function removeCartItem(id: string): Promise<void> {
  const response = await cartFetch(`/api/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  await unwrapEnvelope(response);
}
