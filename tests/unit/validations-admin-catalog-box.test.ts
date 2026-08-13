import { describe, it, expect } from "vitest";
import { createBoxSchema, updateBoxSchema } from "@/lib/validations/admin-catalog";

describe("createBoxSchema - category (Milestone 18)", () => {
  const base = { slug: "snack-box-s", title: "Snack Box S", priceCents: 1500 };

  it("accepts omitting category entirely", () => {
    const result = createBoxSchema.parse(base);
    expect(result.category).toBeUndefined();
  });

  it("accepts a null category", () => {
    const result = createBoxSchema.parse({ ...base, category: null });
    expect(result.category).toBeNull();
  });

  it("accepts each valid category value", () => {
    for (const category of ["snack_box", "candy_box", "mystery_box", "passport_box"]) {
      const result = createBoxSchema.parse({ ...base, category });
      expect(result.category).toBe(category);
    }
  });

  it("rejects an invalid category value", () => {
    expect(() => createBoxSchema.parse({ ...base, category: "gift_box" })).toThrow();
  });
});

describe("updateBoxSchema - category (Milestone 18)", () => {
  it("accepts an empty object - a PATCH may touch only one field", () => {
    expect(() => updateBoxSchema.parse({})).not.toThrow();
  });

  it("accepts clearing a category back to null", () => {
    const result = updateBoxSchema.parse({ category: null });
    expect(result.category).toBeNull();
  });

  it("accepts a valid category value", () => {
    const result = updateBoxSchema.parse({ category: "candy_box" });
    expect(result.category).toBe("candy_box");
  });

  it("rejects an invalid category value", () => {
    expect(() => updateBoxSchema.parse({ category: "not_a_real_category" })).toThrow();
  });
});
