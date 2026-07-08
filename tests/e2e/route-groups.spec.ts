import { test, expect } from "@playwright/test";

const routes: Array<[string, string]> = [
  ["/", "Sweet Shop"],
  ["/shop", "Shop Placeholder"],
  ["/account", "Account Placeholder"],
  ["/admin", "Admin Placeholder"],
];

for (const [path, expectedText] of routes) {
  test(`${path} renders its placeholder heading`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: expectedText })).toBeVisible();
  });
}

test("marketing and shop pages share the SiteHeader nav", async ({ page }) => {
  for (const path of ["/", "/shop"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Shop", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sweet Shop", exact: true })).toBeVisible();
  }
});

test("unknown route renders the global not-found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
