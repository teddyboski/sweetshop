// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSignInWithOtp = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  }),
}));

// Milestone 10: rate limiting is its own concern with its own dedicated
// test coverage (tests/unit/rate-limit-check.test.ts,
// tests/integration/rate-limiting.test.ts) - mocked out here so this file
// stays focused on magic-link logic, same as every other auth route test.
vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: { auth: { scope: "auth", limit: 60, windowSeconds: 600 } },
}));

beforeEach(() => {
  mockSignInWithOtp.mockReset();
});

describe("POST /api/auth/magic-link", () => {
  it("returns the same generic success message for a real account", async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null });

    const { POST } = await import("@/app/api/auth/magic-link/route");

    const request = new NextRequest("http://localhost:3000/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email: "real-user@b.com" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.message).toBe("If an account exists, a login link has been sent.");
  });

  it("rejects an invalid email before calling supabase", async () => {
    const { POST } = await import("@/app/api/auth/magic-link/route");

    const request = new NextRequest("http://localhost:3000/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });
});
