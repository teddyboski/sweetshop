import { test, expect } from "@playwright/test";

// "/" is intentionally excluded here: Task 4 replaced its placeholder
// heading with real content ("Snacks that hit different."), already
// covered by tests/e2e/marketing-pages.spec.ts.
// "/account" and "/admin" are intentionally excluded here as of Milestone
// 2 Task 5: they are now protected by proxy.ts and redirect unauthenticated
// visitors to /login before their placeholder content would render.
// That redirect behavior is covered by tests/e2e/middleware.spec.ts.
const routes: Array<[string, string]> = [["/shop", "Shop Placeholder"]];

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
