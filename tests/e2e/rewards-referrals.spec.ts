import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Milestone 9, Task 6. Same real-Stripe-hosted-Checkout approach as
// checkout.spec.ts (see that file's header comment for the card-iframe /
// bot-detection / shipping-field caveats, which apply identically here) -
// these two journeys are the actual product-critical paths Milestone 9
// added on top of that existing checkout flow: a referred signup's first
// purchase crediting both accounts, and a promo code + points redemption
// combining into a real discounted Stripe charge.
//
// Per auth-flow.spec.ts's established convention, test accounts are seeded
// directly via admin.auth.admin.createUser({ email_confirm: true }) rather
// than driven through the real signup form - that avoids the shared
// free-tier email-send rate limit, and the signup form itself (plus the
// referral_code metadata capture it performs) is already covered by
// auth-flow.spec.ts (skipped-in-CI) and rewards-referrals-foundations.test.ts
// (the DB trigger, exercised directly). What's NOT covered elsewhere is the
// full logged-in purchase journey actually crediting the referral and
// producing the right Stripe charge - that's this file's job.

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

test.describe.configure({ mode: "serial" });

/**
 * The checkout.session.completed webhook does all of its DB writes (order,
 * order_items, rewards, promo/redemption, referral crediting) BEFORE it
 * ever calls Resend to send the confirmation email - so those writes are
 * already committed well before a possible email failure. But Stripe
 * delivers that webhook to our local dev server asynchronously relative to
 * the browser's redirect back from Stripe, and a real run showed the
 * route's first-ever hit in a fresh `next dev` process taking ~9s (Turbopack
 * cold-compiling it) - so polling here, not a single check immediately
 * after landing on the success page, which is what the DB write actually
 * races against.
 */
async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 60_000, intervalMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result !== null) return result;
    if (Date.now() > deadline) throw new Error("Timed out waiting for the webhook to commit its DB writes");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function createConfirmedUser(prefix: string, userMetadata?: Record<string, unknown>) {
  const email = `test-e2e-${prefix}-${crypto.randomUUID()}@mailinator.com`;
  const password = "password123";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (error || !data.user) throw error;
  return { id: data.user.id, email, password };
}

async function loginViaUi(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account/);
}

/**
 * Drives Stripe's real hosted Checkout page through to a completed test-card
 * payment - the shared middle section of checkout.spec.ts's single test,
 * extracted here since both journeys below need it after their own
 * cart/discount setup differs.
 *
 * checkout.spec.ts never needed to fill an email field because its guest
 * session sets customer_email, which Stripe pre-fills on the hosted page.
 * The checkout-session route (Task 3) only sets customer_email for guests
 * (`!isAuthenticated ? parsed.data.guestEmail : undefined`) - an
 * authenticated one-time-payment session carries no email at all, so
 * Stripe's hosted page renders its own empty Email field that must be
 * filled here or the Pay button silently never completes (confirmed via a
 * real run: the click succeeds but the page never redirects, timing out
 * on the success-URL wait below rather than erroring visibly).
 */
async function payWithTestCard(page: import("@playwright/test").Page, email: string) {
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30000, waitUntil: "domcontentloaded" });

  // Unlike the address fields below (genuinely conditional on autocomplete
  // state, hence the short isVisible probe pattern), this field is always
  // present for an authenticated one-time-payment session (no
  // customer_email set) - so it's filled unconditionally here, the same
  // way "Full name" is, relying on Playwright's normal action-timeout
  // auto-wait rather than a 3s existence probe. A real run showed the 3s
  // probe returning false (and silently skipping the fill) even though the
  // field appeared a moment later - proven by the very next line's "Full
  // name" fill succeeding immediately after on the same page.
  await page.getByLabel(/^email$/i).fill(email);

  await page.getByRole("textbox", { name: "Full name" }).fill("Test Customer");

  const enterManuallyButton = page.getByRole("button", { name: "Enter address manually" });
  if (await enterManuallyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await enterManuallyButton.click();
  }
  const addressLine1 = page.getByLabel(/address line 1/i);
  if (await addressLine1.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addressLine1.fill("123 Test St");
  }
  const cityField = page.getByLabel(/^city$/i);
  if (await cityField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cityField.fill("Testville");
  }
  const stateField = page.getByLabel(/state/i);
  if (await stateField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await stateField.selectOption("CA");
  }
  const zipField = page.getByLabel(/zip|postal code/i);
  if (await zipField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await zipField.fill("94103");
  }

  await page.getByRole("radio", { name: "Card" }).click({ force: true });
  await page.getByRole("textbox", { name: "Card number" }).fill("4242424242424242");
  await page.getByRole("textbox", { name: "Expiration" }).fill("12/34");
  await page.getByRole("textbox", { name: "CVC" }).fill("123");
  await page.getByRole("textbox", { name: "Phone number" }).fill("2015550123");

  await page.getByRole("button", { name: "Pay", exact: true }).click();

  await page.waitForURL(/\/shop\/checkout\/success/, { timeout: 30000, waitUntil: "domcontentloaded" });
  await expect(page.getByText("Thanks for your order!")).toBeVisible({ timeout: 15000 });
}

test("a referred user's first purchase credits both accounts 500 points and flips the referral to Credited", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);

  const referrer = await createConfirmedUser("referrer");
  const { data: referrerProfile } = await admin
    .from("profiles")
    .select("referral_code, rewards_points")
    .eq("id", referrer.id)
    .single();
  const referrerPointsBefore = referrerProfile!.rewards_points;

  const referred = await createConfirmedUser("referred", { referral_code: referrerProfile!.referral_code });

  try {
    await loginViaUi(page, referred.email, referred.password);

    await page.goto("/shop/box/munchie-box");
    await page.getByRole("button", { name: "Add to Cart" }).click();
    await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });

    await page.goto("/shop/cart", { timeout: 60000 });
    await expect(page.getByText("The Munchie Box")).toBeVisible();
    await page.getByRole("button", { name: "Checkout" }).click();

    await payWithTestCard(page, referred.email);

    const referralRow = await waitFor(async () => {
      const { data } = await admin
        .from("referrals")
        .select("status")
        .eq("referrer_id", referrer.id)
        .eq("referred_id", referred.id)
        .maybeSingle();
      return data?.status === "credited" ? data : null;
    });
    expect(referralRow.status).toBe("credited");

    // DB state is already confirmed above, so there's no race left to lose
    // here - this just confirms the UI itself reflects it. The "Friends
    // you've referred" page (account/referrals/page.tsx) only lists
    // referrals where the CURRENT user is the referrer, so this has to be
    // checked from a separate logged-in session as referrer, not `page`
    // (still logged in as referred, who has nothing to show on that page).
    const referrerContext = await browser.newContext();
    const referrerPage = await referrerContext.newPage();
    await loginViaUi(referrerPage, referrer.email, referrer.password);
    await referrerPage.goto("/account/referrals");
    await expect(referrerPage.getByText("Credited")).toBeVisible({ timeout: 15000 });
    await referrerContext.close();

    const { data: referrerAfter } = await admin.from("profiles").select("rewards_points").eq("id", referrer.id).single();
    expect(referrerAfter!.rewards_points).toBe(referrerPointsBefore + 500);

    const { data: referrerLedger } = await admin
      .from("rewards_ledger")
      .select("delta_points")
      .eq("user_id", referrer.id)
      .eq("reason", "referral_referrer_credit");
    expect(referrerLedger).toHaveLength(1);
    expect(referrerLedger![0]!.delta_points).toBe(500);
  } finally {
    await admin.from("customer_activity").delete().or(`user_id.eq.${referrer.id},user_id.eq.${referred.id}`);
    await admin.from("referrals").delete().or(`referrer_id.eq.${referrer.id},referred_id.eq.${referred.id}`);
    const { data: orders } = await admin.from("orders").select("id").eq("user_id", referred.id);
    for (const order of orders ?? []) {
      await admin.from("rewards_ledger").delete().eq("order_id", order.id);
      await admin.from("orders").delete().eq("id", order.id);
    }
    await admin.from("rewards_ledger").delete().or(`user_id.eq.${referrer.id},user_id.eq.${referred.id}`);
    await admin.from("carts").delete().eq("user_id", referred.id);
    await admin.auth.admin.deleteUser(referred.id);
    await admin.auth.admin.deleteUser(referrer.id);
  }
});

test("a stacked promo code and rewards-points redemption produce the correctly discounted Stripe charge", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const buyer = await createConfirmedUser("promo-redeem");
  await admin.from("profiles").update({ rewards_points: 1000 }).eq("id", buyer.id);

  const { data: promotion, error: promoError } = await admin
    .from("promotions")
    .insert({
      code: `E2E${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      discount_type: "fixed",
      value: 300,
      usage_limit: null,
      expires_at: null,
    })
    .select("id, code")
    .single();
  if (promoError || !promotion) throw promoError;

  try {
    await loginViaUi(page, buyer.email, buyer.password);

    await page.goto("/shop/box/munchie-box");
    await page.getByRole("button", { name: "Add to Cart" }).click();
    await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });

    await page.goto("/shop/cart", { timeout: 60000 });
    await expect(page.getByText("The Munchie Box")).toBeVisible();

    await page.getByLabel("Promo code").fill(promotion.code);
    await page.getByLabel(/Redeem rewards points/).fill("300");

    await page.getByRole("button", { name: "Checkout" }).click();

    await payWithTestCard(page, buyer.email);

    // munchie-box is 1500 cents; 300 (promo) + 300 (1 point = 1 cent) = 600
    // off, for an expected charge of 900 cents. Polled, same reasoning as
    // waitFor's header comment - the order doesn't exist until the webhook
    // (delivered asynchronously relative to this redirect) creates it.
    const order = await waitFor(async () => {
      const { data } = await admin
        .from("orders")
        .select("id, total_amount_cents")
        .eq("user_id", buyer.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    });
    expect(order!.total_amount_cents).toBe(900);

    const { data: promoAfter } = await admin.from("promotions").select("used_count").eq("id", promotion.id).single();
    expect(promoAfter!.used_count).toBe(1);

    const { data: redemptionLedger } = await admin
      .from("rewards_ledger")
      .select("delta_points")
      .eq("order_id", order!.id)
      .eq("reason", "redemption");
    expect(redemptionLedger).toHaveLength(1);
    expect(redemptionLedger![0]!.delta_points).toBe(-300);
  } finally {
    await admin.from("promotions").delete().eq("id", promotion.id);
    await admin.from("customer_activity").delete().eq("user_id", buyer.id);
    const { data: orders } = await admin.from("orders").select("id").eq("user_id", buyer.id);
    for (const order of orders ?? []) {
      await admin.from("rewards_ledger").delete().eq("order_id", order.id);
      await admin.from("orders").delete().eq("id", order.id);
    }
    await admin.from("carts").delete().eq("user_id", buyer.id);
    await admin.auth.admin.deleteUser(buyer.id);
  }
});
