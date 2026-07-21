import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * fetch() wrapper for client components that attaches the signed-in
 * visitor's access token as a Bearer Authorization header when a session
 * exists. Every cart/checkout Route Handler in this app authenticates
 * exclusively via that header - never a browser cookie session, a
 * deliberate mobile-readiness choice (see resolve-cart.ts's header comment)
 * - so a client component that calls plain fetch() is silently treated as
 * an anonymous guest even when the visitor is logged in. Sending no header
 * at all (rather than an empty one) when there's no session preserves the
 * existing anonymous-cart behavior for genuinely signed-out visitors.
 */
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(input, { ...init, headers });
}
