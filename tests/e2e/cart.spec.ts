import { test, expect } from "@playwright/test";

// Seed data (supabase/migrations/20260719115452_catalog_seed_data.sql):
// munchie-box = $15.00 (mystery box), sour-gummy-worms = $3.00 (individually
// sellable snack), build-a-box-small = $15.00 flat (8-slot build-a-box).

// These tests each chain multiple routes (box detail, snack detail,
// build-a-box, cart) that may never have been hit yet in this dev-server
// run. Next.js dev mode (Turbopack) compiles each lazily on first request,
// and with fullyParallel workers hitting several cold routes at once, the
// concurrent compiles contend for CPU on the single shared dev server -
// same class of shared-resource contention already documented and fixed
// with serial mode in auth-flow.spec.ts (there it was Supabase Auth
// rate-limiting; here it's Turbopack compile contention).
test.describe.configure({ mode: "serial" });

async function addCuratedBoxToCart(page: import("@playwright/test").Page) {
  await page.goto("/shop/box/munchie-box");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });
}

async function addSnackToCart(page: import("@playwright/test").Page) {
  await page.goto("/shop/snack/sour-gummy-worms");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });
}

async function completeBuildABoxSmall(page: import("@playwright/test").Page) {
  await page.goto("/shop/build-a-box");
  await page.getByRole("button", { name: /Build a Box - Small/ }).click();

  const addButtons = page.getByRole("button", { name: /^Add one / });
  for (let i = 0; i < 8; i++) {
    await addButtons.nth(i).click();
  }

  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 15000 });
}

test("adding a box, a snack, and a Build-a-Box all show up together in the cart with a correct total", async ({
  page,
}) => {
  // Whole-test timeout, not just the individual goto() timeout: this test
  // chains four routes that may each be cold-compiling in this dev-server
  // run (box detail, snack detail, build-a-box, cart), and Playwright's
  // 30s default test timeout was firing on the overall test before any
  // single action's own timeout budget was exhausted.
  test.setTimeout(120_000);

  await addCuratedBoxToCart(page);
  await addSnackToCart(page);
  await completeBuildABoxSmall(page);

  // Generous timeout: /shop/cart has a heavier first-compile import graph
  // than most routes (live getCartContents DB query, Supabase SSR auth
  // check, a client component tree) - Next.js dev mode (Turbopack) compiles
  // it lazily on first hit, and that compile can outlast Playwright's 30s
  // default nav timeout under concurrent test load, same class of delay
  // documented for /api/cart/items in build-a-box.spec.ts.
  await page.goto("/shop/cart", { timeout: 60000 });

  await expect(page.getByText("The Munchie Box")).toBeVisible();
  await expect(page.getByText("Sour Gummy Worms")).toBeVisible();
  await expect(page.getByText("Build a Box - Small")).toBeVisible();

  // $15 box + $3 snack + $15 build-a-box = $33, ships free since a box (in
  // fact three) is present regardless of the snack-only $25 threshold.
  await expect(page.getByTestId("cart-total")).toHaveText("$33.00");
  await expect(page.getByTestId("cart-shipping")).toHaveText("Free");
});

test("removing a line updates the running total", async ({ page }) => {
  // See the timeout comment on the previous test - this one chains three
  // potentially-cold routes (box detail, snack detail, cart).
  test.setTimeout(90_000);

  await addCuratedBoxToCart(page);
  await addSnackToCart(page);

  // Generous timeout: /shop/cart has a heavier first-compile import graph
  // than most routes (live getCartContents DB query, Supabase SSR auth
  // check, a client component tree) - Next.js dev mode (Turbopack) compiles
  // it lazily on first hit, and that compile can outlast Playwright's 30s
  // default nav timeout under concurrent test load, same class of delay
  // documented for /api/cart/items in build-a-box.spec.ts.
  await page.goto("/shop/cart", { timeout: 60000 });
  await expect(page.getByTestId("cart-total")).toHaveText("$18.00");

  await page.getByRole("button", { name: "Remove Sour Gummy Worms from cart" }).click();

  // Generous timeout: DELETE /api/cart/items/[id] has never been hit via an
  // actual browser request before this point in the dev server's life -
  // only ever invoked directly in Vitest, which doesn't trigger Next's dev
  // compilation at all. Same first-hit cold-compile class as the other
  // timeouts in this file.
  await expect(page.getByText("Sour Gummy Worms")).not.toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("cart-total")).toHaveText("$15.00");
});

test("a page reload preserves the cart via the anonymous_cart_id cookie", async ({ page }) => {
  await addCuratedBoxToCart(page);

  // Generous timeout: /shop/cart has a heavier first-compile import graph
  // than most routes (live getCartContents DB query, Supabase SSR auth
  // check, a client component tree) - Next.js dev mode (Turbopack) compiles
  // it lazily on first hit, and that compile can outlast Playwright's 30s
  // default nav timeout under concurrent test load, same class of delay
  // documented for /api/cart/items in build-a-box.spec.ts.
  await page.goto("/shop/cart", { timeout: 60000 });
  await expect(page.getByText("The Munchie Box")).toBeVisible();

  await page.reload();

  await expect(page.getByText("The Munchie Box")).toBeVisible();
});

test("shows the empty-cart state with no items added", async ({ page }) => {
  // Generous timeout: /shop/cart has a heavier first-compile import graph
  // than most routes (live getCartContents DB query, Supabase SSR auth
  // check, a client component tree) - Next.js dev mode (Turbopack) compiles
  // it lazily on first hit, and that compile can outlast Playwright's 30s
  // default nav timeout under concurrent test load, same class of delay
  // documented for /api/cart/items in build-a-box.spec.ts.
  await page.goto("/shop/cart", { timeout: 60000 });
  await expect(page.getByText("Your cart is empty")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse the shop" })).toBeVisible();
});
