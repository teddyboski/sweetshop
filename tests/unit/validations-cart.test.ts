import { describe, it, expect } from "vitest";
import { addToCartSchema } from "@/lib/validations/cart";

const validSnackId = "11111111-1111-4111-8111-111111111111";
const validSnackId2 = "22222222-2222-4222-8222-222222222222";

describe("addToCartSchema - build_a_box variant", () => {
  it("accepts a valid submission with preferences", () => {
    const result = addToCartSchema.parse({
      itemType: "build_a_box",
      boxSlug: "build-a-box-small",
      preferences: { snackTypes: ["chips", "candy"], flavors: ["sweet", "spicy"] },
    });
    expect(result.itemType).toBe("build_a_box");
  });

  it("rejects when snackTypes is empty", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        preferences: { snackTypes: [], flavors: ["sweet"] },
      })
    ).toThrow();
  });

  it("rejects when flavors is empty", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        preferences: { snackTypes: ["chips"], flavors: [] },
      })
    ).toThrow();
  });

  it("rejects an invalid snack type value", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        preferences: { snackTypes: ["popcorn"], flavors: ["sweet"] },
      })
    ).toThrow();
  });

  it("rejects an invalid flavor value", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        preferences: { snackTypes: ["chips"], flavors: ["umami"] },
      })
    ).toThrow();
  });

  it("rejects missing preferences entirely", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
      })
    ).toThrow();
  });

  it("accepts multiple snack types and flavors", () => {
    const result = addToCartSchema.parse({
      itemType: "build_a_box",
      boxSlug: "build-a-box-large",
      preferences: {
        snackTypes: ["chips", "candy", "cookies", "chocolate"],
        flavors: ["sweet", "salty", "spicy"],
      },
    });
    if (result.itemType !== "build_a_box") throw new Error("expected build_a_box");
    expect(result.preferences.snackTypes).toHaveLength(4);
    expect(result.preferences.flavors).toHaveLength(3);
  });
});

describe("addToCartSchema - box variant", () => {
  it("accepts a valid submission", () => {
    const result = addToCartSchema.parse({ itemType: "box", boxSlug: "munchie-box", quantity: 2 });
    expect(result).toEqual({ itemType: "box", boxSlug: "munchie-box", quantity: 2 });
  });

  it("rejects a zero quantity", () => {
    expect(() => addToCartSchema.parse({ itemType: "box", boxSlug: "munchie-box", quantity: 0 })).toThrow();
  });

  it("rejects a box submission carrying snack-shaped fields", () => {
    expect(() =>
      addToCartSchema.parse({ itemType: "box", snackId: validSnackId, quantity: 1 })
    ).toThrow();
  });
});

describe("addToCartSchema - snack variant", () => {
  it("accepts a valid submission", () => {
    const result = addToCartSchema.parse({ itemType: "snack", snackId: validSnackId, quantity: 3 });
    expect(result).toEqual({ itemType: "snack", snackId: validSnackId, quantity: 3 });
  });

  it("rejects a non-uuid snackId", () => {
    expect(() => addToCartSchema.parse({ itemType: "snack", snackId: "nope", quantity: 1 })).toThrow();
  });

  it("rejects a snack submission carrying a boxSlug instead of snackId", () => {
    expect(() =>
      addToCartSchema.parse({ itemType: "snack", boxSlug: "munchie-box", quantity: 1 })
    ).toThrow();
  });
});

describe("addToCartSchema - merch variant", () => {
  const validVariantId = "33333333-3333-4333-8333-333333333333";

  it("accepts a valid submission", () => {
    const result = addToCartSchema.parse({ itemType: "merch", merchVariantId: validVariantId, quantity: 1 });
    expect(result).toEqual({ itemType: "merch", merchVariantId: validVariantId, quantity: 1 });
  });

  it("rejects a non-uuid merchVariantId", () => {
    expect(() =>
      addToCartSchema.parse({ itemType: "merch", merchVariantId: "nope", quantity: 1 })
    ).toThrow();
  });

  it("rejects a zero quantity", () => {
    expect(() =>
      addToCartSchema.parse({ itemType: "merch", merchVariantId: validVariantId, quantity: 0 })
    ).toThrow();
  });
});

describe("addToCartSchema - discriminator", () => {
  it("rejects an unknown itemType", () => {
    expect(() => addToCartSchema.parse({ itemType: "gift-card", quantity: 1 })).toThrow();
  });
});
