/**
 * One-off (not part of the app runtime): creates the promo code for the
 * QR-code sticker campaign (10% off, printed on shipped-box stickers).
 * No usage limit or expiry - it's going out on physical stickers
 * indefinitely, so an expiring/limited code would need constant reprints.
 *
 * Usage: npx tsx --env-file=.env.local scripts/create-qr-promo.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/supabase";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const CODE = "SNACK10";

async function main() {
  const admin = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin
    .from("promotions")
    .insert({ code: CODE, discount_type: "percent", value: 10 })
    .select()
    .single();

  if (error) throw error;
  console.log("Created promo code:", data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
