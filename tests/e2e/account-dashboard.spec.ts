import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Same live-Auth rate-limit reasoning as auth-flow.spec.ts's serial block -
// this test signs in via the real Supabase Auth endpoint.
test.describe.configure({ mode: "serial" });

/**
 * Milestone 7, Task 7: the plan's own final integration pass calls for one
 * Playwright journey covering login -> view order -> view/manage
 * subscription (mocked Portal redirect, not a live Stripe Portal session in
 * CI) -> edit preferences -> view rewards -> copy referral link. Order,
 * subscription, and rewards fixtures are seeded directly via the admin
 * client (same as the integration tests) rather than run through a live
 * checkout - that pipeline is already covered by
 * tests/integration/checkout-webhook-route.test.ts; this test is about the
 * account pages themselves.
 */
test("logged-in customer can view an order, manage a subscription, edit preferences, view rewards, and copy their referral link", async ({
  page,
  context,
}) => {
  const email = `test-e2e-dashboard-${crypto.randomUUID()}@mailinator.com`;
  const password = "password123";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError;
  const userId = created.user.id;

  const { data: box } = await admin.from("boxes").select("id, title").eq("slug", "monthly-subscription").single();
  const { data: snack } = await admin
    .from("snacks")
    .select("id")
    .eq("is_sellable_individually", true)
    .limit(1)
    .single();

  const { data: order } = await admin
    .from("orders")
    .insert({ user_id: userId, status: "paid", total_amount_cents: 1999, shipping_address: null })
    .select("id")
    .single();
  const orderId = order!.id;
  await admin
    .from("order_items")
    .insert({ order_id: orderId, item_type: "snack", snack_id: snack!.id, quantity: 1, unit_price_cents: 1999 });

  const { data: subscription } = await admin
    .from("subscriptions")
    .insert({
      user_id: userId,
      box_id: box!.id,
      stripe_subscription_id: `sub_test_e2e_${crypto.randomUUID()}`,
      status: "active",
    })
    .select("id")
    .single();

  await admin.from("rewards_ledger").insert({ user_id: userId, delta_points: 19, reason: "order_placed", order_id: orderId });
  await admin.from("profiles").update({ rewards_points: 19 }).eq("id", userId);

  const { data: profile } = await admin.from("profiles").select("referral_code").eq("id", userId).single();

  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // --- Login ---
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // --- View order ---
    await page.goto("/account/orders");
    await expect(page.getByText(`Order #${orderId.slice(0, 8)}`)).toBeVisible();
    await page.getByText(`Order #${orderId.slice(0, 8)}`).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${orderId}`));
    await expect(page.getByRole("heading", { name: `Order #${orderId.slice(0, 8)}` })).toBeVisible();

    // --- View/manage subscription (mocked Portal redirect - see header comment) ---
    await page.route("**/api/account/subscriptions/portal-session", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { url: "/account/subscriptions?portal=mock" }, error: null }),
      })
    );
    await page.goto("/account/subscriptions");
    await expect(page.getByText(box!.title)).toBeVisible();
    await page.getByRole("button", { name: "Manage Subscription" }).click();
    await expect(page).toHaveURL(/portal=mock/);

    // --- Edit preferences ---
    await page.goto("/account/preferences");
    await page.getByLabel("Dietary restrictions").fill("nut-free");
    await page.getByLabel("Spice tolerance").selectOption("mild");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Dietary restrictions")).toHaveValue("nut-free");

    // --- View rewards ---
    await page.goto("/account/rewards");
    await expect(page.getByText("19 pts")).toBeVisible();
    await expect(page.getByText(`Order #${orderId.slice(0, 8)}`)).toBeVisible();

    // --- Copy referral link ---
    await page.goto("/account/referrals");
    await expect(page.getByRole("textbox")).toHaveValue(new RegExp(`ref=${profile!.referral_code}`));
    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  } finally {
    await admin.from("rewards_ledger").delete().eq("user_id", userId);
    await admin.from("orders").delete().eq("id", orderId);
    if (subscription) await admin.from("subscriptions").delete().eq("id", subscription.id);
    await admin.auth.admin.deleteUser(userId);
  }
});
