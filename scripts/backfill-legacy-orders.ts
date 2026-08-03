/**
 * Milestone 10, Task 2: one-time backfill of pre-platform Stripe orders into
 * legacy_orders (schema already exists as of the initial migration, unused
 * until now - see Milestone 10 plan doc's Ground Truth section).
 *
 * Idempotent: upserts on stripe_payment_intent_id, so re-running this after
 * a partial failure or to pick up newly-succeeded PaymentIntents since the
 * last run is always safe - never creates duplicate rows.
 *
 * Usage (run by Ted, not automated - see Milestone 10 launch checklist):
 *   npx tsx scripts/backfill-legacy-orders.ts
 *
 * Requires STRIPE_SECRET_KEY and the Supabase service-role env vars to be
 * set in the shell's environment before running - point these at
 * production only when actually doing the production backfill; point them
 * at a test-mode Stripe key + local Supabase for a dry run first.
 *
 * runBackfill() itself takes already-constructed clients rather than
 * building them internally, so tests/integration/backfill-legacy-orders.test.ts
 * can pass a mocked Stripe client (per the Milestone 10 plan: fake
 * PaymentIntent-shaped records, never live Stripe in tests) alongside the
 * real local admin Supabase client - same "never mock the database"
 * convention as every other integration test in this repo.
 */
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/supabase";

const BATCH_SIZE = 100;

export interface BackfillSummary {
  scanned: number;
  succeededSeen: number;
  inserted: number;
  updated: number;
  matchedToProfile: number;
  skippedErrors: Array<{ paymentIntentId: string; message: string }>;
}

function extractEmailFromCharges(paymentIntent: Stripe.PaymentIntent): string | null {
  const charges = (paymentIntent as unknown as { charges?: { data: Stripe.Charge[] } }).charges;
  return charges?.data?.[0]?.billing_details?.email ?? null;
}

export async function runBackfill(
  stripe: Pick<Stripe, "paymentIntents">,
  admin: SupabaseClient<Database>
): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    scanned: 0,
    succeededSeen: 0,
    inserted: 0,
    updated: 0,
    matchedToProfile: 0,
    skippedErrors: [],
  };

  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list({
      limit: BATCH_SIZE,
      starting_after: startingAfter,
    });

    for (const paymentIntent of page.data) {
      summary.scanned++;

      // Only ever backfill orders that actually completed - a legacy
      // record of a payment attempt that never succeeded would be
      // misleading in an admin-only orders table, not helpful.
      if (paymentIntent.status !== "succeeded") continue;
      summary.succeededSeen++;

      try {
        const email = paymentIntent.receipt_email ?? extractEmailFromCharges(paymentIntent);
        if (!email) {
          summary.skippedErrors.push({
            paymentIntentId: paymentIntent.id,
            message: "No email found on payment intent or its charges - email is required, skipping",
          });
          continue;
        }

        const { data: existingBeforeThisRun } = await admin
          .from("legacy_orders")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle();

        // Best-effort match (plan doc Product Decision #3): a legacy order
        // is still recorded even if nobody made an account on the new
        // platform under this email - matched_user_id simply stays null.
        const { data: matchedProfile } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();

        const { error: upsertError } = await admin.from("legacy_orders").upsert(
          {
            stripe_payment_intent_id: paymentIntent.id,
            email,
            amount_cents: paymentIntent.amount_received ?? paymentIntent.amount,
            product_description: paymentIntent.description ?? null,
            created_at: new Date(paymentIntent.created * 1000).toISOString(),
            matched_user_id: matchedProfile?.id ?? null,
          },
          { onConflict: "stripe_payment_intent_id" }
        );

        if (upsertError) {
          summary.skippedErrors.push({ paymentIntentId: paymentIntent.id, message: upsertError.message });
          continue;
        }

        if (existingBeforeThisRun) summary.updated++;
        else summary.inserted++;
        if (matchedProfile) summary.matchedToProfile++;
      } catch (err) {
        // Never let one bad record abort the whole backfill - log and
        // continue, per the plan doc's explicit requirement.
        summary.skippedErrors.push({
          paymentIntentId: paymentIntent.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    hasMore = page.has_more;
    startingAfter = page.data.at(-1)?.id;
  }

  return summary;
}

function printSummary(summary: BackfillSummary) {
  console.log("Legacy Stripe order backfill complete:");
  console.log(`  PaymentIntents scanned:      ${summary.scanned}`);
  console.log(`  Succeeded PaymentIntents:    ${summary.succeededSeen}`);
  console.log(`  Rows inserted:               ${summary.inserted}`);
  console.log(`  Rows updated (re-run):       ${summary.updated}`);
  console.log(`  Matched to existing profile: ${summary.matchedToProfile}`);
  console.log(`  Skipped/errored:             ${summary.skippedErrors.length}`);
  if (summary.skippedErrors.length > 0) {
    console.log("  Details:");
    for (const { paymentIntentId, message } of summary.skippedErrors) {
      console.log(`    - ${paymentIntentId}: ${message}`);
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  // Deferred imports so this module can be imported by tests (which supply
  // their own fake Stripe client and real local-Supabase admin client)
  // without ever requiring live Stripe/production env vars to be set.
  const { createClient } = await import("@supabase/supabase-js");
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  const admin = createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const summary = await runBackfill(stripe, admin);
  printSummary(summary);
}

// Standard ESM entrypoint-detection (this file has no "type": "module" CJS
// equivalent available under this project's tsconfig - module: esnext /
// isolatedModules - so require.main is not available). Only runs main() when
// this file is executed directly (npx tsx scripts/backfill-legacy-orders.ts),
// never as a side effect of a test importing runBackfill().
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    console.error("Legacy order backfill failed:", err);
    process.exit(1);
  });
}
