import * as SecureStore from "expo-secure-store";

/**
 * Storage adapter for @supabase/supabase-js's auth persistence, backed by
 * Expo SecureStore instead of AsyncStorage. Per the Milestone 11 plan:
 * "Supabase Auth wired via @supabase/supabase-js + Expo SecureStore" —
 * SecureStore uses the OS keychain (iOS) / EncryptedSharedPreferences
 * (Android) rather than plain-text storage, which matters here because
 * the value being stored is a live session (access + refresh tokens).
 *
 * SecureStore has a 2048-byte-per-value limit on some Android versions,
 * which a Supabase session blob can occasionally exceed once it includes
 * a full user object. Splitting isn't implemented here because SDK 57's
 * SecureStore raised the practical ceiling well past what a Supabase
 * session actually needs (a few hundred bytes) - noted as a known edge
 * case to revisit only if a real "value too long" error shows up, not
 * something to solve speculatively.
 */
export const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
