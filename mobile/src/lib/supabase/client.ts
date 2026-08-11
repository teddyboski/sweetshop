import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
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

/**
 * autoRefreshToken alone is not enough on React Native: Supabase's refresh
 * timer only ticks while the JS engine is actively running in the
 * foreground. The moment the app backgrounds (screen lock, app switch),
 * that timer stalls - if enough real time passes before the app returns to
 * the foreground, the access token has quietly expired with nothing having
 * refreshed it, and the very next authenticated API call fails with a 401
 * ("Invalid or expired session" from resolveCartId/resolveExistingCartId
 * and every other authenticated route). This is Supabase's own documented
 * requirement for React Native, not an optional extra - found the hard way
 * during live device testing (2026-08-10): an item added to cart while
 * signed in disappeared from the Cart tab a few minutes later with
 * "Couldn't load your cart," traced to exactly this missing wiring.
 */
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
