/**
 * One-off pre-launch fix (Milestone 10). Restores the 4 snacks found
 * depleted by check-data-health.ts back to the Milestone 6 seed baseline
 * of 100 units (20260720123000_checkout_inventory_seed.sql) - not real
 * inventory data, just resetting the placeholder so checkout-inventory-
 * reservation.test.ts passes again and pre-launch stock isn't misleadingly
 * low from test runs.
 *
 * Usage: npx tsx --env-file=.env.local scripts/reseed-depleted-inventory.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/supabase";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const SNACK_NAMES_TO_RESEED = [
  "Sour Gummy Worms",
  "Chocolate Chunk Cookies",
  "Spicy Nacho Chips",
  "Pretzel Bites",
];

async function main() {
  const admin = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: snacks, error: snacksError } = await admin
    .from("snacks")
    .select("id, name")
    .in("name", SNACK_NAMES_TO_RESEED);
  if (snacksError) throw snacksError;

  for (const snack of snacks ?? []) {
    const { error } = await admin
      .from("inventory")
      .update({ quantity_on_hand: 100 })
      .eq("snack_id", snack.id);
    if (error) throw error;
    console.log(`Reset ${snack.name} to 100`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
