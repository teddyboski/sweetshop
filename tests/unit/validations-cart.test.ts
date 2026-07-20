import { describe, it, expect } from "vitest";
import { addToCartSchema } from "@/lib/validations/cart";

const validSnackId = "11111111-1111-4111-8111-111111111111";
const validSnackId2 = "22222222-2222-4222-8222-222222222222";

describe("addToCartSchema - build_a_box variant", () => {
  it("accepts a valid submission", () => {
    const result = addToCartSchema.parse({
      itemType: "build_a_box",
      boxSlug: "build-a-box-small",
      snacks: [{ snackId: validSnackId, quantity: 8 }],
    });
    expect(result.itemType).toBe("build_a_box");
  });

  it("rejects an empty snacks array", () => {
    expect(() =>
      addToCartSchema.parse({ itemType: "build_a_box", boxSlug: "build-a-box-small", snacks: [] })
    ).toThrow();
  });

  it("rejects a zero or negative quantity", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        snacks: [{ snackId: validSnackId, quantity: 0 }],
      })
    ).toThrow();
  });

  it("rejects duplicate snackId entries", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        snacks: [
          { snackId: validSnackId, quantity: 1 },
          { snackId: validSnackId, quantity: 1 },
        ],
      })
    ).toThrow();
  });

  it("rejects a non-uuid snackId", () => {
    expect(() =>
      addToCartSchema.parse({
        itemType: "build_a_box",
        boxSlug: "build-a-box-small",
        snacks: [{ snackId: "not-a-uuid", quantity: 1 }],
      })
    ).toThrow();
  });

  it("accepts multiple distinct snacks", () => {
    const result = addToCartSchema.parse({
      itemType: "build_a_box",
      boxSlug: "build-a-box-small",
      snacks: [
        { snackId: validSnackId, quantity: 4 },
        { snackId: validSnackId2, quantity: 4 },
      ],
    });
    if (result.itemType !== "build_a_box") throw new Error("expected build_a_box");
    expect(result.snacks).toHaveLength(2);
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

describe("addToCartSchema - discriminator", () => {
  it("rejects an unknown itemType", () => {
    expect(() => addToCartSchema.parse({ itemType: "gift-card", quantity: 1 })).toThrow();
  });
});
