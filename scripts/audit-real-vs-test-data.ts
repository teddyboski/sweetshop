/**
 * One-off pre-launch audit (Milestone 10). Read-only - makes no changes.
 * Lists every profile and order whose email doesn't match this repo's own
 * test-fixture email patterns (always @mailinator.com or @example.com,
 * see any tests/integration/*.test.ts), so Ted can confirm by eye that
 * nothing real is about to be caught up in a test-data cleanup before this
 * project is treated as production.
 *
 * Usage: npx tsx --env-file=.env.local scripts/audit-real-vs-test-data.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/supabase";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const TEST_EMAIL_PATTERN = /@(mailinator\.com|example\.com)$/i;

async function main() {
  const admin = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, created_at");
  if (profilesError) throw profilesError;

  const testProfiles = (profiles ?? []).filter((p) => TEST_EMAIL_PATTERN.test(p.email ?? ""));
  const nonTestProfiles = (profiles ?? []).filter((p) => !TEST_EMAIL_PATTERN.test(p.email ?? ""));

  console.log(`=== Profiles: ${profiles?.length ?? 0} total ===`);
  console.log(`Matches known test pattern (@mailinator.com / @example.com): ${testProfiles.length}`);
  console.log(`Does NOT match - review these individually:`);
  for (const p of nonTestProfiles) {
    console.log(`  ${p.email}  (id=${p.id}, created_at=${p.created_at})`);
  }

  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, guest_email, user_id, total_amount_cents, status, created_at, profiles(email)");
  if (ordersError) throw ordersError;

  console.log(`\n=== Orders: ${orders?.length ?? 0} total ===`);
  for (const o of orders ?? []) {
    const email = o.guest_email ?? (o.profiles as unknown as { email: string } | null)?.email ?? "(no email found)";
    const isTest = TEST_EMAIL_PATTERN.test(email);
    console.log(
      `  ${isTest ? "[test]" : "[REVIEW]"}  ${email}  $${(o.total_amount_cents / 100).toFixed(2)}  status=${o.status}  created_at=${o.created_at}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
