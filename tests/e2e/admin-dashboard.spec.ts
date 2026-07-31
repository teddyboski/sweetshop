import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Milestone 8, Task 2's query functions (admin-dashboard.ts) can't be
// imported directly here - they pull in src/lib/supabase/admin.ts, which is
// guarded by the `server-only` package and throws when resolved through
// Playwright's own module loader (it isn't a Next.js server/client
// boundary at all, but server-only's bundler-condition detection still
// trips). Re-implemented inline against the same plain admin client already
// created above instead - identical query logic, see that file's
// getOrdersAwaitingFulfillmentCount/getLowStockSnacks for the source of
// truth these mirror.
const LOW_STOCK_THRESHOLD = 10;

async function getOrdersAwaitingFulfillmentCount(): Promise<number> {
  const { count, error } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "paid")
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function getLowStockSnacks(): Promise<Array<{ name: string }>> {
  const { data, error } = await admin
    .from("inventory")
    .select("quantity_on_hand, snacks(name)")
    .lt("quantity_on_hand", LOW_STOCK_THRESHOLD)
    .order("quantity_on_hand", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ name: row.snacks?.name ?? "" }));
}

// Same live-Auth rate-limit reasoning as auth-flow.spec.ts/account-dashboard.spec.ts's
// serial blocks - this test signs in via the real Supabase Auth endpoint.
test.describe.configure({ mode: "serial" });

/**
 * Milestone 8, Task 12: the plan's own final integration pass calls for one
 * Playwright journey covering login as admin -> create a box (confirm it
 * appears live on the storefront) -> mark a seeded order fulfilled with a
 * tracking number -> adjust a customer's rewards balance -> adjust inventory
 * -> confirm the Operations Dashboard reflects the changes. Fixtures (the
 * customer, the seeded order, a snack to adjust) are seeded directly via the
 * admin client, same pattern as account-dashboard.spec.ts - this test is
 * about the admin pages themselves, not re-proving checkout/webhook
 * behavior already covered by the integration suite.
 */
test("admin can create a box, fulfill an order, adjust rewards, adjust inventory, and see it reflected on the dashboard", async ({
  page,
}) => {
  // Generous timeout for the same reasons as account-dashboard.spec.ts: many
  // admin-client round trips plus several next dev cold-compiled page loads
  // against a live, shared, free-tier Supabase project - this journey has
  // more steps than that one.
  test.setTimeout(150_000);

  const password = "password123";

  const adminEmail = `test-e2e-admin-${crypto.randomUUID()}@mailinator.com`;
  const { data: adminUser, error: adminError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  if (adminError || !adminUser.user) throw adminError;
  const adminUserId = adminUser.user.id;
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminUserId);

  const customerEmail = `test-e2e-customer-${crypto.randomUUID()}@mailinator.com`;
  const { data: customerUser, error: customerError } = await admin.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
  });
  if (customerError || !customerUser.user) throw customerError;
  const customerUserId = customerUser.user.id;

  const { data: order } = await admin
    .from("orders")
    .insert({ user_id: customerUserId, status: "paid", total_amount_cents: 2999 })
    .select("id")
    .single();
  const orderId = order!.id;

  const { data: snack } = await admin.from("snacks").select("id, name").eq("is_sellable_individually", true).limit(1).single();
  const snackId = snack!.id;
  const { data: originalInventory } = await admin.from("inventory").select("quantity_on_hand").eq("snack_id", snackId).single();
  const originalQuantity = originalInventory!.quantity_on_hand;

  const { data: customerBefore } = await admin.from("profiles").select("rewards_points").eq("id", customerUserId).single();

  const newBoxSlug = `e2e-test-box-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // --- Login as admin ---
    await page.goto("/login");
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // --- Create a box ---
    await page.goto("/admin/boxes");
    await page.getByLabel("Slug").fill(newBoxSlug);
    await page.getByLabel("Title").fill("E2E Test Box");
    await page.getByLabel("Price (cents)").fill("2500");
    await page.getByLabel("Status").selectOption("active");
    await page.getByRole("button", { name: "Create box" }).click();
    await expect(page).toHaveURL(/\/admin\/boxes$/);
    await expect(page.getByText("E2E Test Box")).toBeVisible();

    // --- Confirm it appears live on the storefront ---
    await page.goto("/shop");
    await expect(page.getByText("E2E Test Box")).toBeVisible({ timeout: 30_000 });

    // --- Mark the seeded order fulfilled with a tracking number ---
    // This dynamic route has never been compiled yet in this dev server
    // process - the global 15s expect timeout (see playwright.config.ts's
    // own header comment on next dev cold-compiling each route on first
    // hit) isn't always enough for a brand new route's very first request;
    // extended here specifically rather than raising the suite-wide default.
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByRole("heading", { name: new RegExp(`Order ${orderId}`) })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Tracking number").fill("1Z999AA10123456784");
    await page.getByRole("button", { name: "Mark fulfilled" }).click();
    await expect(page.getByRole("heading", { name: "Status: fulfilled" })).toBeVisible();

    // --- Adjust a customer's rewards balance ---
    await page.goto("/admin/rewards");
    await page.getByLabel("Customer user ID").fill(customerUserId);
    await page.getByLabel("Points adjustment (+/-)").fill("100");
    await page.getByRole("button", { name: "Apply adjustment" }).click();
    await expect(page.getByText(customerEmail)).toBeVisible({ timeout: 30_000 });

    // --- Adjust inventory ---
    await page.goto("/admin/inventory");
    const inventoryRow = page.getByTestId(`inventory-row-${snackId}`);
    await expect(inventoryRow).toBeVisible({ timeout: 30_000 });
    await inventoryRow.getByRole("spinbutton").fill("15");
    await inventoryRow.getByRole("button", { name: "Apply" }).click();
    await expect(inventoryRow.getByText(`${originalQuantity + 15} on hand`)).toBeVisible();

    // --- Confirm the Operations Dashboard reflects the changes ---
    const [expectedAwaitingFulfillment, expectedLowStock] = await Promise.all([
      getOrdersAwaitingFulfillmentCount(),
      getLowStockSnacks(),
    ]);
    await page.goto("/admin");
    const awaitingFulfillmentCard = page.getByText("Orders awaiting fulfillment").locator("..");
    await expect(awaitingFulfillmentCard.getByText(String(expectedAwaitingFulfillment), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    if (expectedLowStock.length === 0) {
      await expect(page.getByText("Nothing running low right now.")).toBeVisible();
    } else {
      await expect(page.getByText(expectedLowStock[0]!.name)).toBeVisible();
    }
  } finally {
    await admin.from("inventory").update({ quantity_on_hand: originalQuantity }).eq("snack_id", snackId);
    await admin.from("rewards_ledger").delete().eq("user_id", customerUserId);
    await admin.from("profiles").update({ rewards_points: customerBefore?.rewards_points ?? 0 }).eq("id", customerUserId);
    await admin.from("orders").delete().eq("id", orderId);
    await admin.from("boxes").delete().eq("slug", newBoxSlug);
    await admin.from("customer_activity").delete().eq("user_id", customerUserId);
    await admin.from("audit_logs").delete().eq("actor_id", adminUserId);
    await admin.auth.admin.deleteUser(customerUserId);
    await admin.auth.admin.deleteUser(adminUserId);
  }
});
