import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Anon-key client with no cookie/session wiring, for public, RLS-readable
 * data only (catalog boxes/snacks/drops). Deliberately does not call
 * next/headers' cookies() - that would force any ISR/static page that uses
 * it into fully dynamic rendering, defeating `revalidate: 60`.
 *
 * Cached as a module-level singleton: constructing a new GoTrueClient per
 * call (this client has no per-request state, unlike the cookie-based
 * server client) triggers Supabase's "Multiple GoTrueClient instances"
 * warning under any concurrent test/request load. One instance, reused.
 */
let cached: ReturnType<typeof createClient<Database>> | null = null;

export function createPublicSupabaseClient() {
  if (!cached) {
    cached = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return cached;
}
