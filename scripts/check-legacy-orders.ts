/**
 * One-off verification (Milestone 10). Read-only. Confirms what the
 * backfill actually pulled in before treating it as final.
 *
 * Usage: npx tsx --env-file=.env.local scripts/check-legacy-orders.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/supabase";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const admin = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin.from("legacy_orders").select("*");
  if (error) throw error;

  console.log(`=== legacy_orders: ${data?.length ?? 0} row(s) ===`);
  for (const row of data ?? []) {
    console.log(row);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
