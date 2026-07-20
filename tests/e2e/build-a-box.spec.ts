import { test, expect } from "@playwright/test";

test("BYO-ineligible international snacks never appear in the picker", async ({ page }) => {
  await page.goto("/shop/build-a-box");
  await page.getByRole("button", { name: /Build a Box - Small/ }).click();
  await expect(page.getByText("Japanese Matcha KitKat")).not.toBeVisible();
});

test("picking fewer than the required count keeps submit disabled", async ({ page }) => {
  await page.goto("/shop/build-a-box");
  await page.getByRole("button", { name: /Build a Box - Small/ }).click();

  await expect(page.getByText("0 / 8 picked")).toBeVisible();

  const addButtons = page.getByRole("button", { name: /^Add one / });
  for (let i = 0; i < 7; i++) {
    await addButtons.nth(i).click();
  }

  await expect(page.getByText("7 / 8 picked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Cart" })).toBeDisabled();
});

test("picking exactly 8 items enables submit and adds to cart", async ({ page }) => {
  await page.goto("/shop/build-a-box");
  await page.getByRole("button", { name: /Build a Box - Small/ }).click();

  const addButtons = page.getByRole("button", { name: /^Add one / });
  for (let i = 0; i < 8; i++) {
    await addButtons.nth(i).click();
  }

  await expect(page.getByText("8 / 8 picked")).toBeVisible();
  const submit = page.getByRole("button", { name: "Add to Cart" });
  await expect(submit).toBeEnabled();

  await submit.click();
  // Generous timeout: Next.js dev mode (Turbopack) lazily compiles a route
  // handler on its first hit, and /api/cart/items hasn't been requested yet
  // in this dev-server run - the actual route logic runs in ~1.6s per the
  // integration tests, but first-hit compilation alone can take several
  // seconds longer than Playwright's 5s default.
  await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });
});
