import "server-only";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const ANONYMOUS_CART_COOKIE = "anonymous_cart_id";

/**
 * Milestone 13 (mobile): a Set-Cookie response header is the web-only half
 * of anonymous-cart persistence - browsers store and replay it
 * automatically, but there's no equivalent guarantee for React Native's
 * fetch (no shared cookie jar contract the way a browser has one). Mirrors
 * the Authorization-bearer-token precedent exactly: an explicit header the
 * client itself is responsible for storing and replaying (SecureStore
 * instead of a cookie) and reading back out of the JSON response body
 * (anonymousCartId below) rather than a header it may not reliably see.
 */
const ANONYMOUS_CART_HEADER = "x-anonymous-cart-id";

function getAnonymousIdFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(ANONYMOUS_CART_COOKIE)?.value ?? request.headers.get(ANONYMOUS_CART_HEADER) ?? undefined;
}

export interface CartResolution {
  cartId?: string;
  userId?: string;
  /** The anonymous id actually in use for this request, new or existing - always set on a successful anonymous resolution, so any caller can echo it back for a mobile client to persist. */
  anonymousCartId?: string;
  /** Web-only: set only when a *new* anonymous id was minted, so the route handler knows to also emit a Set-Cookie. */
  newAnonymousCookie?: string;
  error?: string;
  status?: number;
}

/**
 * Resolves the caller's cart id, creating one if needed. Auth is via an
 * optional bearer token (mobile-readiness constraint, matches
 * auth/reset-password's pattern) - never assumed from a browser cookie
 * session. No token means guest/anonymous, resolved via a request/response
 * -bound cookie instead of next/headers' cookies() (which needs Next's
 * request-scoped async context, unavailable when a Route Handler is
 * invoked directly in a test).
 */
export async function resolveCartId(
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

  const existingAnonymousId = getAnonymousIdFromRequest(request);

  if (existingAnonymousId) {
    const { data: existingCart } = await admin
      .from("carts")
      .select("id")
      .eq("anonymous_id", existingAnonymousId)
      .eq("status", "active")
      .maybeSingle();
    if (existingCart) return { cartId: existingCart.id, anonymousCartId: existingAnonymousId };
  }

  const newAnonymousId = crypto.randomUUID();
  const { data: newCart, error } = await admin
    .from("carts")
    .insert({ anonymous_id: newAnonymousId })
    .select("id")
    .single();
  if (error || !newCart) return { error: "Could not create cart", status: 500 };

  return { cartId: newCart.id, anonymousCartId: newAnonymousId, newAnonymousCookie: newAnonymousId };
}

/**
 * Resolves the caller's existing cart id WITHOUT creating one. Used by
 * PATCH/DELETE on an existing cart_item, where "no cart yet" simply means
 * the caller can't own the item they're referencing (404, not a reason to
 * mint a brand-new empty cart as a side effect of an ownership check).
 */
export async function resolveExistingCartId(
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
    return { cartId: existingCart?.id, userId: user.id };
  }

  const existingAnonymousId = getAnonymousIdFromRequest(request);
  if (!existingAnonymousId) return {};

  const { data: existingCart } = await admin
    .from("carts")
    .select("id")
    .eq("anonymous_id", existingAnonymousId)
    .eq("status", "active")
    .maybeSingle();

  return { cartId: existingCart?.id, anonymousCartId: existingAnonymousId };
}

/**
 * Server Component variant of the read-only cart lookup above. Server
 * Components genuinely do have access to request-scoped `next/headers`
 * cookies() (unlike a Route Handler under test, which is why the two
 * resolvers above take a NextRequest instead) - this one is only ever called
 * from the cart page, never from testable Route Handler logic.
 */
export async function resolveCartIdForPage(
  admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: existingCart } = await admin
      .from("carts")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    return existingCart?.id ?? null;
  }

  const cookieStore = await cookies();
  const anonymousId = cookieStore.get(ANONYMOUS_CART_COOKIE)?.value;
  if (!anonymousId) return null;

  const { data: existingCart } = await admin
    .from("carts")
    .select("id")
    .eq("anonymous_id", anonymousId)
    .eq("status", "active")
    .maybeSingle();

  return existingCart?.id ?? null;
}
