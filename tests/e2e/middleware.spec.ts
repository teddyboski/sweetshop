import { test, expect } from "@playwright/test";

test("unauthenticated visitor hitting /account is redirected to /login", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated visitor hitting /admin is redirected to /login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("redirect preserves the original destination as a query param", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/redirect=%2Faccount/);
});
