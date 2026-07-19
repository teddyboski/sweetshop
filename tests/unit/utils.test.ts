import { describe, it, expect } from "vitest";
import { cn, formatPriceCents } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("resolves conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, undefined, null, "py-1")).toBe("px-2 py-1");
  });
});

describe("formatPriceCents", () => {
  it("formats whole-dollar cents as USD", () => {
    expect(formatPriceCents(1500)).toBe("$15.00");
  });

  it("formats cents with a fractional remainder", () => {
    expect(formatPriceCents(1599)).toBe("$15.99");
  });

  it("formats zero as $0.00", () => {
    expect(formatPriceCents(0)).toBe("$0.00");
  });
});
