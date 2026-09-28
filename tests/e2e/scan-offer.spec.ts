import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

test.describe.configure({ mode: "serial" });

test("the scan page explains the offer and sends new customers to signup with the offer code", async ({ page }) => {
  await page.goto("/scan", { timeout: 60000 });

  await expect(page.getByRole("heading", { level: 1, name: "15% off your first order" })).toBeVisible();

  const cta = page.getByRole("link", { name: "Create my account" });
  await expect(cta).toHaveAttribute("href", "/signup?offer=SCAN15");

  await expect(page.getByRole("main").getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(page.getByText(/one use per customer/i)).toBeVisible();

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("the create-account button lands on the signup form", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/scan", { timeout: 60000 });
  await page.getByRole("link", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/signup\?offer=SCAN15/, { timeout: 60000 });
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible({ timeout: 60000 });
});

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatCents = (cents: number) => usd.format(cents / 100);

async function loginViaUi(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account/, { timeout: 60000 });
}

async function addSnack(page: import("@playwright/test").Page, slug: string) {
  await page.goto(`/shop/snack/${encodeURIComponent(slug)}`);
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 60000 });
}

// The cart shows either "Free" or a formatted currency string.
function parseShippingCents(text: string): number {
  return /free/i.test(text) ? 0 : Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
}

test.describe("welcome offer in the cart", () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  let snack: { slug: string; priceCents: number };

  // Read-only: picks an active, in-stock, individually sellable snack with no
  // size variants (so its own price_cents is what the cart charges). Nothing in
  // the catalog is modified, and no checkout happens, so no stock is reserved.
  test.beforeAll(async () => {
    const { data, error } = await admin
      .from("snacks")
      .select("slug, price_cents, inventory!inner(quantity_on_hand), snack_variants(status)")
      .eq("status", "active")
      .eq("is_sellable_individually", true)
      .gte("price_cents", 299)
      .gte("inventory.quantity_on_hand", 5)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const match = (data ?? []).find(
      (s) => s.slug && s.price_cents !== null && !(s.snack_variants ?? []).some((v) => v.status === "active")
    );
    if (!match || match.price_cents === null) throw new Error("no active in-stock sellable snack found");
    snack = { slug: match.slug, priceCents: match.price_cents };
  });

  test.afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  async function seedOfferPromotion() {
    const { data, error } = await admin
      .from("promotions")
      .insert({
        code: `E2EOFFER${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        discount_type: "percent",
        value: 15,
        first_order_only: true,
      })
      .select("id, code")
      .single();
    if (error || !data) throw error;
    cleanup.push(async () => admin.from("promotions").delete().eq("id", data.id));
    return data;
  }

  async function createCustomer(metadata?: Record<string, unknown>) {
    const email = `test-e2e-scan-${crypto.randomUUID()}@mailinator.com`;
    const password = "password123";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw error;
    cleanup.push(async () => admin.auth.admin.deleteUser(data.user!.id));
    return { id: data.user.id, email, password };
  }

  test("shows the discount and the reduced total for a customer who signed up through the scan", async ({ page }) => {
    test.setTimeout(120_000);
    const promotion = await seedOfferPromotion();
    const customer = await createCustomer({ offer_code: promotion.code });

    await loginViaUi(page, customer.email, customer.password);
    await addSnack(page, snack.slug);
    await page.goto("/shop/cart", { timeout: 60000 });

    const discountCents = Math.round((snack.priceCents * 15) / 100);
    const offerLine = page.getByTestId("cart-welcome-offer");
    await expect(offerLine).toBeVisible();
    await expect(offerLine).toContainText("15% off");
    await expect(offerLine).toContainText(`−${formatCents(discountCents)}`);

    await expect(page.getByTestId("cart-subtotal")).toHaveText(formatCents(snack.priceCents));
    const shippingCents = parseShippingCents((await page.getByTestId("cart-shipping").textContent()) ?? "");
    await expect(page.getByTestId("cart-total")).toHaveText(
      formatCents(snack.priceCents + shippingCents - discountCents)
    );
  });

  test("shows no offer line for a customer without the signup offer", async ({ page }) => {
    test.setTimeout(120_000);
    await seedOfferPromotion();
    const customer = await createCustomer();

    await loginViaUi(page, customer.email, customer.password);
    await addSnack(page, snack.slug);
    await page.goto("/shop/cart", { timeout: 60000 });

    await expect(page.getByTestId("cart-subtotal")).toBeVisible();
    await expect(page.getByTestId("cart-welcome-offer")).toHaveCount(0);

    const shippingCents = parseShippingCents((await page.getByTestId("cart-shipping").textContent()) ?? "");
    await expect(page.getByTestId("cart-total")).toHaveText(formatCents(snack.priceCents + shippingCents));
  });
});
