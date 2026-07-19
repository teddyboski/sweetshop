import { test, expect } from "@playwright/test";

// Substitutes for a full Lighthouse CI run (none exists in this repo yet -
// see Milestone 3 plan, Product Decision #4): asserts the concrete elements
// Lighthouse's SEO category actually checks on a detail page.
test("box detail page has the SEO fundamentals Lighthouse checks", async ({ page }) => {
  await page.goto("/shop/box/munchie-box");

  await expect(page).toHaveTitle(/The Munchie Box/);

  const description = page.locator('meta[name="description"]');
  await expect(description).toHaveAttribute("content", /.+/);

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute("href", /\/shop\/box\/munchie-box$/);

  const viewport = page.locator('meta[name="viewport"]');
  await expect(viewport).toHaveAttribute("content", /.+/);

  const images = page.locator("img, [role=img]");
  const count = await images.count();
  for (let i = 0; i < count; i++) {
    const el = images.nth(i);
    const tag = await el.evaluate((n) => n.tagName.toLowerCase());
    if (tag === "img") {
      await expect(el).toHaveAttribute("alt", /.*/);
    } else {
      await expect(el).toHaveAttribute("aria-label", /.*/);
    }
  }
});
