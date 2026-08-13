import { describe, it, expect } from "vitest";
import {
  createMerchItemSchema,
  updateMerchItemSchema,
  createMerchVariantSchema,
  updateMerchVariantSchema,
} from "@/lib/validations/admin-merch";

describe("createMerchItemSchema", () => {
  it("accepts a minimal valid submission and defaults status to draft", () => {
    const result = createMerchItemSchema.parse({
      slug: "sweet-shop-tee",
      name: "Sweet Shop Tee",
      priceCents: 2400,
    });
    expect(result.status).toBe("draft");
  });

  it("rejects a zero or negative price", () => {
    expect(() =>
      createMerchItemSchema.parse({ slug: "sweet-shop-tee", name: "Sweet Shop Tee", priceCents: 0 })
    ).toThrow();
  });

  it("rejects a missing slug", () => {
    expect(() => createMerchItemSchema.parse({ name: "Sweet Shop Tee", priceCents: 2400 })).toThrow();
  });
});

describe("updateMerchItemSchema", () => {
  it("accepts an empty object - a PATCH may touch only one field", () => {
    expect(() => updateMerchItemSchema.parse({})).not.toThrow();
  });

  it("rejects an invalid status value", () => {
    expect(() => updateMerchItemSchema.parse({ status: "deleted" })).toThrow();
  });
});

describe("createMerchVariantSchema", () => {
  it("defaults initialQuantity to 0 when omitted", () => {
    const result = createMerchVariantSchema.parse({});
    expect(result.initialQuantity).toBe(0);
  });

  it("rejects a negative initial quantity", () => {
    expect(() => createMerchVariantSchema.parse({ initialQuantity: -1 })).toThrow();
  });

  it("rejects a zero or negative price override when provided", () => {
    expect(() => createMerchVariantSchema.parse({ priceCentsOverride: 0 })).toThrow();
  });

  it("accepts a full variant submission", () => {
    const result = createMerchVariantSchema.parse({
      size: "M",
      color: "Navy",
      sku: "TEE-M-NAVY",
      priceCentsOverride: 2800,
      initialQuantity: 12,
    });
    expect(result.size).toBe("M");
    expect(result.initialQuantity).toBe(12);
  });
});

describe("updateMerchVariantSchema", () => {
  it("accepts a status-only archive submission", () => {
    const result = updateMerchVariantSchema.parse({ status: "archived" });
    expect(result.status).toBe("archived");
  });

  it("rejects an invalid status value", () => {
    expect(() => updateMerchVariantSchema.parse({ status: "deleted" })).toThrow();
  });
});
