import { test, expect } from "@playwright/test";

// Seed data (supabase/migrations/20260719115452_catalog_seed_data.sql):
// munchie-box = $15.00 (mystery box).
//
// This test drives Stripe's real hosted Checkout page (checkout.stripe.com),
// not a mock - per the project's "no mocking, hit the real dependency"
// convention already established for Supabase integration tests. Two real
// risks are documented here rather than papered over:
//
// 1. Stripe's card fields (number/expiry/CVC) render inside a cross-origin
//    iframe served from js.stripe.com. Playwright's frameLocator, scoped by
//    the iframe's title attribute, is the documented, supported way to
//    reach into it - this is NOT a hack, Stripe's own ecosystem examples use
//    this exact pattern.
// 2. Stripe's hosted Checkout runs bot detection that CAN block headless
//    automation depending on account/Radar configuration. This test may
//    need adjustment (or may simply fail on first run) if that triggers -
//    that's expected to be discovered by actually running it, not assumed
//    away in advance.
//
// The shipping address fields below (name/line1/city/state/zip) are filled
// using label-based locators as a best guess at Stripe's current hosted
// Checkout markup - Stripe does not publish stable selectors for these the
// way it documents the card iframe's title attributes. If Stripe's real
// page structure differs, these specific locators are the first thing to
// fix against the actual page.
test.describe.configure({ mode: "serial" });

test("guest completes checkout with a Stripe test card and lands on the confirmation page", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/shop/box/munchie-box");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });

  await page.goto("/shop/cart", { timeout: 60000 });
  await expect(page.getByText("The Munchie Box")).toBeVisible();

  await page.getByRole("button", { name: "Checkout" }).click();

  // Guest (not signed in) - the email prompt should appear inline.
  await page.getByLabel("Email for your order confirmation").fill(`e2e-checkout-${crypto.randomUUID()}@mailinator.com`);
  await page.getByRole("button", { name: "Continue to Payment" }).click();

  // Full navigation to Stripe's hosted, cross-origin Checkout page.
  // waitUntil: "domcontentloaded" (not the default "load") - confirmed via a
  // real run that the browser does reach checkout.stripe.com and fires
  // domcontentloaded well within the timeout, but Stripe's checkout page is
  // a heavy SPA that can keep open connections (long-polling/websockets)
  // long enough that a traditional "load" event never fires within 30s.
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30000, waitUntil: "domcontentloaded" });

  // shipping_address_collection (Task 2) means Stripe also collects a
  // shipping address on this page. Confirmed via a real run's captured page
  // snapshot: the default UI is a "Full name" textbox plus a Google-Places-
  // style autocomplete combobox labeled "Address" (fragile to automate -
  // suggestion dropdown, network-dependent) with an "Enter address
  // manually" button that switches to plain, separately-labeled fields -
  // using that fallback deliberately rather than fighting the autocomplete.
  await page.getByRole("textbox", { name: "Full name" }).fill("Test Customer");

  const enterManuallyButton = page.getByRole("button", { name: "Enter address manually" });
  if (await enterManuallyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await enterManuallyButton.click();
  }

  const addressLine1 = page.getByLabel(/address line 1/i);
  if (await addressLine1.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addressLine1.fill("123 Test St");
  }
  const cityField = page.getByLabel(/^city$/i);
  if (await cityField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cityField.fill("Testville");
  }
  // A <select> (id="shippingAdministrativeArea"), not a text input -
  // confirmed via a real run's error output.
  const stateField = page.getByLabel(/state/i);
  if (await stateField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await stateField.selectOption("CA");
  }
  const zipField = page.getByLabel(/zip|postal code/i);
  if (await zipField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await zipField.fill("94103");
  }

  // Multiple payment methods are enabled here (Card, Cash App Pay, US bank
  // account, Klarna, Afterpay), rendered as a collapsed accordion. Two real
  // runs showed contradictory overlap/visibility behavior for the various
  // candidate targets (the radio itself, and a data-testid overlay button)
  // depending on exact page state - force: true bypasses Playwright's
  // visibility/overlap actionability checks and dispatches the click
  // directly at the radio's coordinates, sidestepping whichever element is
  // actually on top at click time.
  await page.getByRole("radio", { name: "Card" }).click({ force: true });

  // Confirmed via a real run's captured snapshot: once expanded, these
  // render as plain accessible textboxes with clear ARIA labels ("Card
  // number", "Expiration", "CVC") - no iframe boundary needed at all,
  // simpler than the frameLocator approach documented for older Stripe
  // integrations.
  await page.getByRole("textbox", { name: "Card number" }).fill("4242424242424242");
  await page.getByRole("textbox", { name: "Expiration" }).fill("12/34");
  await page.getByRole("textbox", { name: "CVC" }).fill("123");

  // Phone number is required here (likely tied to the "Save my information
  // for faster checkout" / Link enrollment option, checked by default) -
  // confirmed via a real run where clicking Pay without it just focused the
  // field as invalid instead of submitting.
  await page.getByRole("textbox", { name: "Phone number" }).fill("2015550123");

  // The persistent bottom "Pay" button (distinct from each accordion row's
  // own "Pay with X" label) is the real submit trigger - confirmed via the
  // same snapshot, which shows it as a separate, sticky element below the
  // payment-method list.
  await page.getByRole("button", { name: "Pay", exact: true }).click();

  // Stripe redirects the browser back to our success_url on completion.
  await page.waitForURL(/\/shop\/checkout\/success/, { timeout: 30000, waitUntil: "domcontentloaded" });
  await expect(page.getByText("Thanks for your order!")).toBeVisible({ timeout: 15000 });
});
