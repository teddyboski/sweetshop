import { describe, it, expect } from "vitest";
import { excludeHouseSnacks } from "@/lib/shop/exclude-house-snacks";

describe("excludeHouseSnacks (Milestone 19)", () => {
  it("drops items tagged house_snacks", () => {
    const snacks = [
      { id: "1", category: "chips" },
      { id: "2", category: "house_snacks" },
      { id: "3", category: "candy" },
    ];
    const result = excludeHouseSnacks(snacks);
    expect(result.map((s) => s.id)).toEqual(["1", "3"]);
  });

  it("keeps everything when nothing is tagged house_snacks", () => {
    const snacks = [
      { id: "1", category: "chips" },
      { id: "2", category: "cakes" },
    ];
    expect(excludeHouseSnacks(snacks)).toHaveLength(2);
  });

  it("keeps items with a null category (untagged snacks aren't house snacks by default)", () => {
    const snacks = [{ id: "1", category: null }];
    expect(excludeHouseSnacks(snacks)).toHaveLength(1);
  });

  it("returns an empty array unchanged", () => {
    expect(excludeHouseSnacks([])).toEqual([]);
  });
});
