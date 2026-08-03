/**
 * One-off pre-launch diagnostic (Milestone 10). Not part of the shippable
 * app - checks the shared hosted Supabase project (used as both dev/test
 * and, per Ted's decision, production going forward) for drift left behind
 * by months of integration tests running against a real live instance
 * instead of a local one: depleted inventory, accumulated test-created
 * rows. Read-only - makes no changes.
 *
 * Usage: npx tsx scripts/check-data-health.ts
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

  console.log("=== Lowest-stock snacks (seed default was 100 each) ===");
  const { data: inventory, error: invError } = await admin
    .from("inventory")
    .select("quantity_on_hand, snacks(name)")
    .order("quantity_on_hand", { ascending: true })
    .limit(20);
  if (invError) throw invError;
  for (const row of inventory ?? []) {
    const snackName = (row.snacks as unknown as { name: string } | null)?.name ?? "(unknown)";
    console.log(`${row.quantity_on_hand}\t${snackName}`);
  }

  console.log("\n=== Row counts (test-pollution check) ===");
  const tables = ["orders", "profiles", "carts", "rewards_ledger", "referrals", "legacy_orders"] as const;
  for (const table of tables) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) throw error;
    console.log(`${table}: ${count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
