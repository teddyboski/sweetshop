import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  magicLinkSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

describe("signupSchema", () => {
  it("accepts a valid email and password", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "password123" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({ email: "not-an-email", password: "password123" });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "anything" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("magicLinkSchema", () => {
  it("accepts a valid email", () => {
    expect(magicLinkSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
  it("rejects an invalid email", () => {
    expect(magicLinkSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects a short password", () => {
    expect(resetPasswordSchema.safeParse({ password: "short" }).success).toBe(false);
  });
  it("accepts a valid password", () => {
    expect(resetPasswordSchema.safeParse({ password: "longenough" }).success).toBe(true);
  });
});
