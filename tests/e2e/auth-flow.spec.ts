import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

test("signup shows a check-your-email confirmation instead of an immediate session", async ({ page }) => {
  // This test calls the real Supabase signUp() endpoint, which sends a real
  // confirmation email through the project's shared free-tier SMTP quota.
  // That quota is low and shared across all signups (real users, other
  // tests, manual testing), so this test is skipped in CI to avoid flaking
  // out unrelated runs. Run it manually locally with:
  // npx playwright test tests/e2e/auth-flow.spec.ts -g "check-your-email"
  // TODO: revisit once custom SMTP (e.g. Resend) is configured for the project.
  test.skip(!!process.env.CI, "hits live email rate limit; run manually");

  const email = `test-e2e-signup-${crypto.randomUUID()}@mailinator.com`;

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test("login with invalid credentials shows an error and does not redirect", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nonexistent@mailinator.com");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("login persists the session across reload, and logout ends it", async ({ page }) => {
  const email = `test-e2e-session-${crypto.randomUUID()}@mailinator.com`;
  const password = "password123";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError;

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("link", { name: "Account" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await admin.auth.admin.deleteUser(created.user.id);
  }
});
