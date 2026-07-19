import { describe, it, expect } from "vitest";
import { catalogQuerySchema } from "@/lib/validations/catalog";

describe("catalogQuerySchema", () => {
  it("defaults page to 1 when no params given", () => {
    const result = catalogQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.category).toBeUndefined();
    expect(result.q).toBeUndefined();
  });

  it("accepts category, tag, q, and page together", () => {
    const result = catalogQuerySchema.parse({ category: "candy", tag: "sour", q: "gummy", page: "2" });
    expect(result).toEqual({ category: "candy", tag: "sour", q: "gummy", page: 2 });
  });

  it("rejects an empty search string", () => {
    expect(() => catalogQuerySchema.parse({ q: "" })).toThrow();
  });

  it("rejects a search string over 100 characters", () => {
    expect(() => catalogQuerySchema.parse({ q: "a".repeat(101) })).toThrow();
  });

  it("rejects page below 1", () => {
    expect(() => catalogQuerySchema.parse({ page: "0" })).toThrow();
  });
});
