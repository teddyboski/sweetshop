import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { secureStoreAdapter } from "./secure-store-adapter";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in the values from the web app's own .env.local " +
      "(same Supabase project - mobile and web share one backend, per the mobile roadmap).",
  );
}

/**
 * Mobile's Supabase client. Mirrors src/lib/supabase/client.ts on the web
 * side conceptually (anon-key, browser/client-safe credentials only -
 * never the service role key), but persists the session via SecureStore
 * instead of cookies, since there's no browser here. autoRefreshToken and
 * persistSession together are what make "a signed-in session survives an
 * app restart" (Milestone 11 completion criterion) actually true.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
