// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type Stripe from "stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runBackfill } from "../../scripts/backfill-legacy-orders";

// Milestone 10, Task 2. Per the plan doc: exercised against hand-seeded
// fake PaymentIntent-shaped records (mocked Stripe client), never live
// Stripe - but against the real local Supabase instance, same "never mock
// the database" convention as every other integration test in this repo.

const admin = createAdminSupabaseClient();
const createdPaymentIntentIds: string[] = [];

afterEach(async () => {
  for (const id of createdPaymentIntentIds) {
    await admin.from("legacy_orders").delete().eq("stripe_payment_intent_id", id);
  }
  createdPaymentIntentIds.length = 0;
});

function fakePaymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  const id = overrides.id ?? `pi_test_${crypto.randomUUID().slice(0, 12)}`;
  createdPaymentIntentIds.push(id);
  return {
    id,
    object: "payment_intent",
    status: "succeeded",
    amount: 2500,
    amount_received: 2500,
    receipt_email: `legacy-${id}@example.com`,
    description: "Legacy snack box order",
    created: Math.floor(Date.now() / 1000),
    ...overrides,
  } as Stripe.PaymentIntent;
}

function fakeStripeClient(pages: Stripe.PaymentIntent[][]): Pick<Stripe, "paymentIntents"> {
  let callIndex = 0;
  return {
    paymentIntents: {
      list: async () => {
        const data = pages[callIndex] ?? [];
        callIndex++;
        return {
          object: "list",
          data,
          has_more: callIndex < pages.length,
          url: "/v1/payment_intents",
        } as Stripe.ApiList<Stripe.PaymentIntent>;
      },
    } as unknown as Stripe["paymentIntents"],
  };
}

describe("runBackfill", () => {
  it("inserts a legacy_orders row for a succeeded payment intent, unmatched to any profile", async () => {
    const paymentIntent = fakePaymentIntent();
    const stripe = fakeStripeClient([[paymentIntent]]);

    const summary = await runBackfill(stripe, admin);

    expect(summary.inserted).toBe(1);
    expect(summary.succeededSeen).toBe(1);

    const { data: row } = await admin
      .from("legacy_orders")
      .select("email, amount_cents, matched_user_id")
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .single();
    expect(row!.email).toBe(paymentIntent.receipt_email);
    expect(row!.amount_cents).toBe(2500);
    expect(row!.matched_user_id).toBeNull();
  });

  it("skips a payment intent that never succeeded", async () => {
    const paymentIntent = fakePaymentIntent({ status: "requires_payment_method" });
    const stripe = fakeStripeClient([[paymentIntent]]);

    const summary = await runBackfill(stripe, admin);
    expect(summary.succeededSeen).toBe(0);
    expect(summary.inserted).toBe(0);

    const { data: row } = await admin
      .from("legacy_orders")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .maybeSingle();
    expect(row).toBeNull();
  });

  it("is idempotent - re-running against the same payment intent updates rather than duplicates", async () => {
    const paymentIntent = fakePaymentIntent();
    const stripe = fakeStripeClient([[paymentIntent]]);

    await runBackfill(stripe, admin);
    const secondSummary = await runBackfill(fakeStripeClient([[paymentIntent]]), admin);

    expect(secondSummary.updated).toBe(1);
    expect(secondSummary.inserted).toBe(0);

    const { data: rows } = await admin
      .from("legacy_orders")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntent.id);
    expect(rows).toHaveLength(1);
  });

  it("matches an existing profile by case-insensitive email", async () => {
    const email = `legacy-match-${crypto.randomUUID()}@example.com`;
    const { data: user, error } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (error || !user.user) throw error;

    try {
      const paymentIntent = fakePaymentIntent({ receipt_email: email.toUpperCase() });
      const stripe = fakeStripeClient([[paymentIntent]]);

      const summary = await runBackfill(stripe, admin);
      expect(summary.matchedToProfile).toBe(1);

      const { data: row } = await admin
        .from("legacy_orders")
        .select("matched_user_id")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .single();
      expect(row!.matched_user_id).toBe(user.user.id);
    } finally {
      await admin.auth.admin.deleteUser(user.user.id);
    }
  });

  it("logs and continues past a payment intent with no email at all, never aborting the whole run", async () => {
    const badPaymentIntent = fakePaymentIntent({ receipt_email: null });
    const goodPaymentIntent = fakePaymentIntent();
    const stripe = fakeStripeClient([[badPaymentIntent, goodPaymentIntent]]);

    const summary = await runBackfill(stripe, admin);

    expect(summary.skippedErrors).toHaveLength(1);
    expect(summary.skippedErrors[0]!.paymentIntentId).toBe(badPaymentIntent.id);
    expect(summary.inserted).toBe(1);

    const { data: goodRow } = await admin
      .from("legacy_orders")
      .select("id")
      .eq("stripe_payment_intent_id", goodPaymentIntent.id)
      .maybeSingle();
    expect(goodRow).not.toBeNull();
  });

  it("pages through multiple batches of payment intents", async () => {
    const first = fakePaymentIntent();
    const second = fakePaymentIntent();
    const stripe = fakeStripeClient([[first], [second]]);

    const summary = await runBackfill(stripe, admin);
    expect(summary.scanned).toBe(2);
    expect(summary.inserted).toBe(2);
  });
});
