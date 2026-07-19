import { test, expect } from "@playwright/test";

test("box detail page renders title, price, and rotates-weekly disclaimer", async ({ page }) => {
  await page.goto("/shop/box/munchie-box");
  await expect(page.getByRole("heading", { name: "The Munchie Box" })).toBeVisible();
  await expect(page.getByText("$15.00")).toBeVisible();
  await expect(page.getByText(/contents rotate weekly and may vary/i)).toBeVisible();
});

test("a nonexistent box slug renders the shop not-found page", async ({ page }) => {
  // HTTP status is asserted separately against a production build - Next.js
  // dev mode (Turbopack) doesn't reliably surface notFound()'s 404 status
  // even when the not-found content renders correctly, same class of
  // dev-vs-production gap as the ISR proof in the milestone plan.
  await page.goto("/shop/box/does-not-exist");
  await expect(page.getByText("We couldn't find that product")).toBeVisible();
});

test("build-a-box detail page shows the slot count instead of example contents", async ({ page }) => {
  await page.goto("/shop/box/build-a-box-medium");
  await expect(page.getByText("Pick exactly 15 snacks to build this box.")).toBeVisible();
});
