import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const anonClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

describe("catalog full-text search", () => {
  it("finds boxes and snacks matching 'spicy'", async () => {
    const [boxes, snacks] = await Promise.all([
      anonClient.from("boxes").select("slug").textSearch("search_vector", "spicy"),
      anonClient.from("snacks").select("slug").textSearch("search_vector", "spicy"),
    ]);

    expect(boxes.data?.some((b) => b.slug === "spicy-chaos")).toBe(true);
    const snackSlugs = snacks.data?.map((s) => s.slug) ?? [];
    expect(snackSlugs).toEqual(expect.arrayContaining(["ghost-pepper-chips", "spicy-mango-gummy"]));
  });

  it("returns zero rows for a nonsense term", async () => {
    const { data } = await anonClient.from("boxes").select("slug").textSearch("search_vector", "zzznonexistentterm");
    expect(data ?? []).toHaveLength(0);
  });
});
