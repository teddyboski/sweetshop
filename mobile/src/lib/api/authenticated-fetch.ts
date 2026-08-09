import { supabase } from "../supabase/client";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error(
    "Missing EXPO_PUBLIC_API_BASE_URL. Set it in .env.local to the web app's deployed URL " +
      "(e.g. https://sweetshop.middlemanmerchants.com) or a local dev server reachable from your phone.",
  );
}

/**
 * Mobile-side half of the mobile-readiness contract the web roadmap's
 * Milestone 1 built the server-side half of: every mutating Route Handler
 * (checkout, cart, rewards, referrals, admin actions) already authenticates
 * via a Bearer token, never a browser cookie session, specifically so a
 * future React Native app could call the same endpoints without a backend
 * redesign. This is that promise being used.
 *
 * Mirrors src/lib/supabase/authenticated-fetch.ts on the web side exactly:
 * attach the session's access token as `Authorization: Bearer <token>`
 * when signed in; send no Authorization header at all (not an empty one)
 * when signed out, so the server's existing anonymous/guest handling still
 * applies unchanged.
 *
 * `path` is a route path only (e.g. "/api/cart/items"), not a full URL -
 * this always targets the one backend both platforms share.
 *
 * EXPO_PUBLIC_API_BASE_URL must be the canonical host, not one that 308s
 * elsewhere. Confirmed the hard way during Milestone 11 verification:
 * sweetshopcentral.com (no www) permanently redirects to
 * www.sweetshopcentral.com, and the Authorization header gets silently
 * dropped by the HTTP client on that redirect hop (standard cross-origin-
 * redirect header-stripping behavior) - every request arrived at the
 * server with no bearer token at all, a 401 with no client-side error to
 * explain why. Always point this at the exact canonical URL.
 */
export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
}
