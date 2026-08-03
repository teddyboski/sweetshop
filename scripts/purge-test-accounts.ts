/**
 * One-off pre-launch cleanup (Milestone 10). Ted confirmed via
 * audit-real-vs-test-data.ts that every one of the 283 profiles and 5
 * orders in this project matches the repo's own test-fixture email
 * pattern (@mailinator.com / @example.com) - none are real. Ted explicitly
 * approved a hard delete for this pre-launch cleanup specifically (not a
 * runtime customer-deletion path - CLAUDE.md's soft-delete-only rule is
 * about protecting real business/audit history, which doesn't exist here
 * yet).
 *
 * Deletes dependent rows first (no cascade on these FKs per
 * 20260710220202_initial_schema.sql), nulls out nullable FKs that point at
 * a test profile without deleting the row they're on (audit_logs,
 * legacy_orders, inventory_events, profiles.referred_by self-reference),
 * then deletes each auth.users row - which cascades profiles,
 * customer_preferences, customer_addresses, and carts automatically
 * (those three are `on delete cascade`).
 *
 * Usage: npx tsx --env-file=.env.local scripts/purge-test-accounts.ts
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

  const { data: profiles, error: profilesError } = await admin.from("profiles").select("id, email");
  if (profilesError) throw profilesError;

  const testProfiles = (profiles ?? []).filter((p) => TEST_EMAIL_PATTERN.test(p.email ?? ""));
  const testIds = testProfiles.map((p) => p.id);

  if (testIds.length === 0) {
    console.log("No test profiles found - nothing to do.");
    return;
  }
  console.log(`Found ${testIds.length} test profiles to purge.`);

  console.log("Deleting dependent rows (no cascade on these FKs)...");
  // rewards_ledger.order_id references orders(id) with no cascade, so it
  // must be cleared before orders can be deleted - order_items/
  // order_item_snacks do cascade, so they need no separate handling.
  const { error: rewardsErr } = await admin.from("rewards_ledger").delete().in("user_id", testIds);
  if (rewardsErr) throw rewardsErr;

  const { error: ordersErr } = await admin.from("orders").delete().in("user_id", testIds);
  if (ordersErr) throw ordersErr;
  const { error: guestOrdersErr } = await admin
    .from("orders")
    .delete()
    .is("user_id", null)
    .like("guest_email", "%@mailinator.com");
  if (guestOrdersErr) throw guestOrdersErr;
  const { error: guestOrdersErr2 } = await admin
    .from("orders")
    .delete()
    .is("user_id", null)
    .like("guest_email", "%@example.com");
  if (guestOrdersErr2) throw guestOrdersErr2;

  const { error: refErr1 } = await admin.from("referrals").delete().in("referrer_id", testIds);
  if (refErr1) throw refErr1;
  const { error: refErr2 } = await admin.from("referrals").delete().in("referred_id", testIds);
  if (refErr2) throw refErr2;

  const { error: subsErr } = await admin.from("subscriptions").delete().in("user_id", testIds);
  if (subsErr) throw subsErr;

  const { error: activityErr } = await admin.from("customer_activity").delete().in("user_id", testIds);
  if (activityErr) throw activityErr;

  console.log("Nulling nullable FKs that point at test profiles (keeping the rows themselves)...");
  const { error: auditErr } = await admin.from("audit_logs").update({ actor_id: null }).in("actor_id", testIds);
  if (auditErr) throw auditErr;

  const { error: legacyErr } = await admin
    .from("legacy_orders")
    .update({ matched_user_id: null })
    .in("matched_user_id", testIds);
  if (legacyErr) throw legacyErr;

  const { error: invEventsErr } = await admin
    .from("inventory_events")
    .update({ created_by: null })
    .in("created_by", testIds);
  if (invEventsErr) throw invEventsErr;

  const { error: referredByErr } = await admin
    .from("profiles")
    .update({ referred_by: null })
    .in("referred_by", testIds);
  if (referredByErr) throw referredByErr;

  console.log("Deleting auth users (cascades profiles/customer_preferences/customer_addresses/carts)...");
  let deleted = 0;
  const failures: Array<{ id: string; email: string | null; message: string }> = [];
  for (const profile of testProfiles) {
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error) {
      failures.push({ id: profile.id, email: profile.email, message: error.message });
      continue;
    }
    deleted++;
  }

  console.log(`\nDone. Deleted ${deleted}/${testIds.length} test accounts.`);
  if (failures.length > 0) {
    console.log(`${failures.length} failed:`);
    for (const f of failures) console.log(`  ${f.email} (${f.id}): ${f.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
