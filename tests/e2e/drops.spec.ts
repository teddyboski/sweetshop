import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const anonClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

test("the active seeded drop shows a live countdown and a Buy CTA", async ({ page }) => {
  const { data } = await anonClient
    .from("drops")
    .select("id, quantity_limit, units_sold")
    .order("quantity_limit", { ascending: false })
    .limit(1)
    .single();

  await page.goto(`/shop/drops/${data!.id}`);
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Now" })).toBeVisible();
});

test("the sold-out seeded drop hides the Buy CTA and shows sold out", async ({ page }) => {
  const { data } = await anonClient
    .from("drops")
    .select("id, quantity_limit, units_sold")
    .order("quantity_limit", { ascending: true })
    .limit(1)
    .single();

  await page.goto(`/shop/drops/${data!.id}`);
  await expect(page.getByText("Sold out")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Now" })).not.toBeVisible();
});
