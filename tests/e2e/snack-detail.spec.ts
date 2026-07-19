import { test, expect } from "@playwright/test";

test("a sellable snack's detail page renders name, brand, and price", async ({ page }) => {
  await page.goto("/shop/snack/japanese-matcha-kitkat");
  await expect(page.getByRole("heading", { name: "Japanese Matcha KitKat" })).toBeVisible();
  await expect(page.getByText("Nestle Japan")).toBeVisible();
  await expect(page.getByText("$6.00")).toBeVisible();
});

test("a nonexistent snack slug renders the shop not-found page", async ({ page }) => {
  // See box-detail.spec.ts's note - HTTP status verified against a
  // production build, not the dev server.
  await page.goto("/shop/snack/does-not-exist");
  await expect(page.getByText("We couldn't find that product")).toBeVisible();
});
