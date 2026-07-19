import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const anonClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

describe("catalog seed data", () => {
  it("has exactly the 13 legacy boxes from the blueprint", async () => {
    const { data, error } = await anonClient.from("boxes").select("slug, title, price_cents, box_type, slot_count");
    expect(error).toBeNull();
    expect(data).toHaveLength(13);
  });

  it("matches known prices from the blueprint exactly", async () => {
    const { data } = await anonClient
      .from("boxes")
      .select("slug, price_cents")
      .in("slug", ["munchie-box", "passport-box", "monthly-subscription"]);

    const bySlug = Object.fromEntries((data ?? []).map((b) => [b.slug, b.price_cents]));
    expect(bySlug["munchie-box"]).toBe(1500);
    expect(bySlug["passport-box"]).toBe(7500);
    expect(bySlug["monthly-subscription"]).toBe(5000);
  });

  it("every build_a_box row has a non-null slot_count matching its size", async () => {
    const { data } = await anonClient
      .from("boxes")
      .select("slug, slot_count")
      .eq("box_type", "build_a_box");

    const bySlug = Object.fromEntries((data ?? []).map((b) => [b.slug, b.slot_count]));
    expect(bySlug["build-a-box-small"]).toBe(8);
    expect(bySlug["build-a-box-medium"]).toBe(15);
    expect(bySlug["build-a-box-large"]).toBe(25);
  });

  it("no non-build_a_box row has a slot_count set", async () => {
    const { data } = await anonClient
      .from("boxes")
      .select("slug, slot_count")
      .neq("box_type", "build_a_box");

    for (const box of data ?? []) {
      expect(box.slot_count).toBeNull();
    }
  });

  it("has 18 starter snacks, all individually sellable, 4 excluded from BYO", async () => {
    const { data } = await anonClient.from("snacks").select("slug, is_sellable_individually, is_byo_eligible");
    expect(data).toHaveLength(18);

    for (const snack of data ?? []) {
      expect(snack.is_sellable_individually).toBe(true);
    }

    const byoExcluded = (data ?? []).filter((s) => !s.is_byo_eligible);
    expect(byoExcluded).toHaveLength(4);
  });
});
