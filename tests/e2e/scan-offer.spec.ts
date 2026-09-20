import { test, expect } from "@playwright/test";

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
