import { describe, it, expect } from "vitest";
import {
  getActiveBoxes,
  getSellableSnacks,
  getBoxBySlug,
  getSnackBySlug,
  getBoxItems,
  getDropById,
  searchCatalog,
} from "@/lib/supabase/queries/catalog";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

const anonClient = createPublicSupabaseClient();

describe("catalog data access layer", () => {
  it("getActiveBoxes returns all 13 active boxes", async () => {
    const boxes = await getActiveBoxes();
    expect(boxes).toHaveLength(13);
  });

  it("getSellableSnacks returns all 18 seeded snacks (all are individually sellable)", async () => {
    const snacks = await getSellableSnacks();
    expect(snacks).toHaveLength(18);
  });

  it("getSellableSnacks filters by category", async () => {
    const snacks = await getSellableSnacks({ category: "candy" });
    expect(snacks!.length).toBeGreaterThan(0);
    for (const s of snacks!) expect(s.category).toBe("candy");
  });

  it("getBoxBySlug returns the box for a valid active slug", async () => {
    const box = await getBoxBySlug("munchie-box");
    expect(box?.title).toBe("The Munchie Box");
  });

  it("getBoxBySlug returns null for a nonexistent slug", async () => {
    const box = await getBoxBySlug("does-not-exist");
    expect(box).toBeNull();
  });

  it("getSnackBySlug returns a BYO-ineligible snack (still individually sellable)", async () => {
    const snack = await getSnackBySlug("japanese-matcha-kitkat");
    expect(snack?.is_sellable_individually).toBe(true);
  });

  it("getBoxItems returns example contents for munchie-box", async () => {
    const { data } = await anonClient.from("boxes").select("id").eq("slug", "munchie-box").single();
    const items = await getBoxItems(data!.id);
    expect(items!.length).toBeGreaterThan(0);
  });

  it("getDropById returns drop with joined box info", async () => {
    const { data } = await anonClient.from("drops").select("id").limit(1).single();
    const drop = await getDropById(data!.id);
    expect(drop?.boxes).toBeDefined();
  });

  it("searchCatalog finds spicy items across boxes and snacks", async () => {
    const result = await searchCatalog("spicy");
    expect(result.boxes!.some((b) => b.slug === "spicy-chaos")).toBe(true);
    expect(result.snacks!.length).toBeGreaterThan(0);
  });
});
