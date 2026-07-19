import { test, expect } from "@playwright/test";

test("shop page lists all seeded boxes and sellable snacks with correct prices", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByRole("heading", { name: "Shop", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /The Munchie Box/ })).toBeVisible();
  await expect(page.getByText("$15.00").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Sour Gummy Worms/ })).toBeVisible();
});

test("filtering by category narrows the snacks grid", async ({ page }) => {
  await page.goto("/shop?category=spicy");
  await expect(page.getByRole("link", { name: /Ghost Pepper Chips/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sour Gummy Worms/ })).not.toBeVisible();
});

test("searching for a term returns matching boxes and snacks", async ({ page }) => {
  await page.goto("/shop?q=spicy");
  await expect(page.getByRole("link", { name: /Spicy Chaos/ })).toBeVisible();
});

test("a nonsense search shows the empty state", async ({ page }) => {
  await page.goto("/shop?q=zzznonexistentterm");
  await expect(page.getByText("No products match your search or filter.")).toBeVisible();
});
