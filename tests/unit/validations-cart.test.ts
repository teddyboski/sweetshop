import { describe, it, expect } from "vitest";
import { addBuildABoxToCartSchema } from "@/lib/validations/cart";

const validSnackId = "11111111-1111-4111-8111-111111111111";
const validSnackId2 = "22222222-2222-4222-8222-222222222222";

describe("addBuildABoxToCartSchema", () => {
  it("accepts a valid submission", () => {
    const result = addBuildABoxToCartSchema.parse({
      boxSlug: "build-a-box-small",
      snacks: [{ snackId: validSnackId, quantity: 8 }],
    });
    expect(result.boxSlug).toBe("build-a-box-small");
  });

  it("rejects an empty snacks array", () => {
    expect(() =>
      addBuildABoxToCartSchema.parse({ boxSlug: "build-a-box-small", snacks: [] })
    ).toThrow();
  });

  it("rejects a zero or negative quantity", () => {
    expect(() =>
      addBuildABoxToCartSchema.parse({
        boxSlug: "build-a-box-small",
        snacks: [{ snackId: validSnackId, quantity: 0 }],
      })
    ).toThrow();
  });

  it("rejects duplicate snackId entries", () => {
    expect(() =>
      addBuildABoxToCartSchema.parse({
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
      addBuildABoxToCartSchema.parse({
        boxSlug: "build-a-box-small",
        snacks: [{ snackId: "not-a-uuid", quantity: 1 }],
      })
    ).toThrow();
  });

  it("accepts multiple distinct snacks", () => {
    const result = addBuildABoxToCartSchema.parse({
      boxSlug: "build-a-box-small",
      snacks: [
        { snackId: validSnackId, quantity: 4 },
        { snackId: validSnackId2, quantity: 4 },
      ],
    });
    expect(result.snacks).toHaveLength(2);
  });
});
