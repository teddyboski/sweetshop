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
  // Deliberately NOT in the serial block below - its known flakiness under
  // heavy same-day testing volume shouldn't cascade into skipping the two
  // healthy tests that follow (Playwright skips remaining serial-block tests
  // after one failure).
  test.skip(!!process.env.CI, "hits live email rate limit; run manually");

  const email = `test-e2e-signup-${crypto.randomUUID()}@mailinator.com`;

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

// These two hit the real, live Supabase Auth signInWithPassword/admin.createUser
// endpoints. Playwright's default parallel workers were sending simultaneous
// auth requests to the same rate-limited free-tier project, causing tests
// that pass individually to fail nondeterministically when run together.
// Serial execution avoids that *intra-file* concurrent-load collision, and
// was verified fixed (confirmed via `-g "login"`, passes reliably, no other
// spec file touches Supabase Auth so it's not a cross-file race). What
// serial mode can't fix: cumulative rate-limiting from total request volume
// across an entire day of live testing - if the full suite runs this test
// during one of those windows, it can still fail even in isolation. That's
// an inherent limit of testing against a live, shared, free-tier Auth
// backend, not a bug - same root cause as the email-quota note above.
test.describe(() => {
  test.describe.configure({ mode: "serial" });

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
});
