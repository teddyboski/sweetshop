import { test, expect } from "@playwright/test";

test("home page shows the Sweet Shop value proposition", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Snacks that hit different." })).toBeVisible();
  await expect(page.getByText(/hand-packed/i)).toBeVisible();
  await expect(page).toHaveTitle(/The Sweet Shop \| Hand-Packed Snack Boxes/);
});

test("about page renders", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "We started on Whatnot. We never stopped hand-packing." })).toBeVisible();
  await expect(page).toHaveTitle(/About The Sweet Shop/);
});

test("build-a-box marketing page renders and links to the functional builder", async ({ page }) => {
  await page.goto("/build-a-box");
  await expect(page.getByRole("heading", { name: "Three sizes. Your call on what's inside." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Building" })).toHaveAttribute("href", "/shop/build-a-box");
  await expect(page).toHaveTitle(/Build Your Own Snack Box/);
});

test("subscriptions marketing page renders", async ({ page }) => {
  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "A fresh exotic haul, every month." })).toBeVisible();
  await expect(page.getByText("Cancel anytime")).toBeVisible();
  await expect(page).toHaveTitle(/Monthly Snack Box Subscription/);
});

test("how-it-works page renders all four steps", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText("Pick your box")).toBeVisible();
  await expect(page.getByText("Earn rewards")).toBeVisible();
  await expect(page.getByText("Refer a friend")).toBeVisible();
});

test("faq page renders as an accordion with real Q&A", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently Asked Questions" })).toBeVisible();
  await expect(page.getByText("Can I cancel my subscription?")).toBeVisible();
  await expect(page.getByText("Do you ship internationally?")).toBeVisible();
});

test("contact page renders", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "Questions? We've got you." })).toBeVisible();
  await expect(page.locator("main").getByText("Manager@middlemanmerchants.com")).toBeVisible();
});

test("privacy policy page renders", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText(/Stripe/)).toBeVisible();
});

test("terms page renders", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await expect(page.getByText(/cancel anytime/i)).toBeVisible();
});
